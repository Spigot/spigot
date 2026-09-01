# Design: Harden IDE Foundations

## Technical Approach

Main owners enforce all four specs through `src/shared/ipc/contracts.ts` v2; preload validates envelopes and renderer stores are projections. Evolve `EngineSessionService`/`PermissionBroker` as the **single chat owner**. No dual writers, timer synchronization, or plaintext rollback.

## Decisions and Contracts

| Choice | Rejected | Rationale |
|---|---|---|
| Authority `{workspaceId,webContentsId,operation,epoch}` | path checks | Issue after dialog selection; workspace switch/navigation/sender destruction/close increments epoch and revokes. Errors: malformed → revoked/unknown → sender/epoch mismatch → unsupported Windows form → containment/race → OS. |
| Main secrets/provider calls | renderer keys | Renderer gets `{credentialRef,provider,configured}`. `SecretVault` resolves refs. Under lock: require `safeStorage`, read plaintext once, encrypt temp v2, fsync/rename, decrypt-verify, destroy plaintext. Failure removes temp and preserves original; rollback reads encrypted v2, never restores plaintext. Key unavailable returns `secret_key_unavailable`, preserves ciphertext, blocks calls. |
| Encrypted recovery journal | localStorage | v1 `{workspaceId,fileId,revision,baseHash,ciphertext,createdAt,ackedAt?}`; limits: 20 MiB/workspace, 2 MiB/file, 100 revisions, newest 10/file plus unacknowledged, seven days. Atomic append precedes monotonic ack; prune acknowledged only. Quarantine corruption; restore last verified revision with warning. Restore before tabs. Tab/workspace/window/updater: Save→ack→proceed; Discard→delete→proceed; Cancel→remain. Electron close prevents default during one gate; one-use approval token permits re-entry. |

`WorkspaceAuthority.authorize` operations: `read/list/watch/write/create/delete/openShell/terminalCwd/lsp/search/git/toolRead/toolWrite/toolExec`. Path call sites: `src/main/index.ts` all `fs:*`, `app:open-shell`, `terminal:create`, `lsp:*`, `git:*`; `agentRunner.ts` edit/glob/list/read/write/run-command/git/grep; `terminal.ts` SSH identity/cwd. Other privileged inventory: updater install→RecoveryGate; terminal write/resize/close→TerminalHost; `store:*` keys and `ai:*`→SecretVault/Engine; external URL→fixed allowlist. Windows: reject `C:foo`, UNC/NT/device, and ADS; normalize separators; case-insensitive equality/root+separator comparison, never prefix. Existing reads/list/watch/openShell/LSP/search/git use `realpath`. Write/create resolves nearest existing ancestor, rejects reparse traversal, opens without following links, then revalidates ancestor+handle; delete revalidates parent+target immediately. Symlink/junction/replacement failure is side-effect-free `path_race`. `WorkspaceAuthority.windows-policy` fixtures at `src/main/workspace/__fixtures__/windows-paths/`: separator-boundary, case-drive, drive-relative/UNC/NT/device/ADS, existing/non-existing, reparse-escape, replacement-race.

## Lifecycle Flows

`terminal:list(workspaceId)` discovers after reload. `TerminalHost`: `creating→running→closing→exited→disposed`; one persistent `src/renderer/features/terminal/TerminalDomOwner.tsx` per session. Attach subscribes/buffers, atomically snapshots session `highWater`, returns retained `(cursor,highWater]`, then drains `>highWater`. Drop duplicates; replay gaps; truncation returns reset snapshot. Retain 4 MiB/session across reload. Write/resize/close have sequenced acks. A 1 MiB subscriber queue pauses PTY, resumes below 256 KiB, else overflow/reset. Sender disposal detaches; close/shutdown disposes once and awaits exit/kill.

`EngineSessionService` maps `{workspaceId,sessionId,turnId}`: one running turn/session, concurrent sessions, sequenced durable v2 history, attachment manifests `{id,name,mime,size,sha256,blobRef}`, and pre-provider dirty snapshots `{fileId,revision,hash,text}`. Cancel atomically denies pending permissions and aborts provider/tool; CAS emits one `completed|cancelled|failed`; terminal turns reject late events.

Commands: `src/shared/commands/registry.ts`; `src/renderer/commands/rendererCommands.ts`; `src/main/services/mainCommands.ts`; `CommandService`; `command-palette/CommandPalette.tsx`. `SearchService` emits ordered `(filePath,line,column)` batches by `jobId`, acks cancellation, caps 500 results/1 MiB file, overlays dirty-buffer revision, drops stale jobs; delete legacy `searchEngine.ts`. `ProcessSupervisor` alone spawns/kills PTY/LSP/tools; domain owners keep protocol/state. LSP `{workspaceId,serverKind}` restarts exponentially 250 ms–8 s, five attempts; replay latest open revisions, reject stale generation/revision diagnostics, shutdown for 2 s then kill.

## Migration, Files, and Evidence

| Slice | Old→new owner; version | Cutover / deletion gate / rollback / named test |
|---|---|---|
| Safety | `index.ts`+renderer store→Authority/Vault/Recovery; IPC/store v2 | preload→stores→views; delete after `safety-recovery`; v1/encrypted rollback; observe denial/migration; `WorkspaceAuthority.windows-policy`, `SecretVault.transactional-migration`, `RecoveryStore.close-reentry`. |
| Terminal | `terminal.ts`+`ConsolePanel`→TerminalHost/DomOwner; terminal v2 | preload→store→panel; delete after `terminal-continuity-order-resize-close`; v1 adapter; observe gap/overflow; `TerminalHost.sequence-recovery`. |
| Chat | global abort/`aiStore`→EngineSessionService; engine/history v2 | preload→aiStore→views; delete after `conversation-routing-cancel-error-attachment`; v1 reader; observe late/terminal; `EngineSessionService.concurrent-terminal`. |
| IDE | Sidebar/LspManager→Command/Search/Supervisor; service v2 | preload→stores→`EditorContainer`/Sidebar/Console; delete after `command-search-lsp-persistence-lifecycle`; v1 reader; observe cancel/restart/orphan; `SearchService.cancel-order`, `LspOwner.restart-replay-shutdown`. |

Modify `index.ts`, `terminal.ts`, `lspManager.ts`, engine owner files, preload, stores, `EditorContainer.tsx`, `EditorTabs.tsx`, `ConsolePanel.tsx`, Sidebar, AIPanel/AgentMode; create named owners/contracts and four spec-named `tests-e2e/*.spec.ts`.

Observability: `{schemaVersion,traceId,requestId,workspaceId,ownerType,ownerId,operation,state,seq,epoch,outcome,errorCode,durationMs}` correlates request→process/event/ack; excludes content/secrets. Inject `FileSystem`, `SafeStorage`, `Clock`, `Uuid`, `PtyFactory`, `SpawnFactory`, `ProviderAdapter`, `Logger`; fixtures: `src/main/**/__fixtures__`, `src/preload/__fixtures__`.

## Threat Matrix

| Boundary | Applicability | Safe/failure behavior; RED test |
|---|---|---|
| Documentation-like paths | Applicable: existing Run File | typed allowlist; docs denied; `run-classification-doclike`. |
| Git repository selection | Applicable: privileged cwd containment | authority-bound root/submodule; escapes denied; `git-repository-authority` (`git -C`, relative, absolute). |
| Commit state | N/A: no Git semantic change | Existing behavior remains out of scope. |
| Push state | N/A: no Git semantic change | Existing behavior remains out of scope. |
| PR commands | N/A: existing `execFile` arguments; only cwd containment changes | Covered by `git-repository-authority`. |

## Open Questions

None.
