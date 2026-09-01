# Design: Secure Workspace Recovery

## Technical Approach

Main owns three authorities: workspace effects, recovery transitions, and credentials. Renderer/preload carry opaque references only. Each adapter resolves authority, captures Windows identity, rechecks sender/epoch/identity immediately before an effect, and emits a redacted audit event. This child supersedes only the blocked parent’s safety/recovery slice; `src/shared/securityContracts.ts` is the stable contract later child changes may consume without importing or reactivating any `harden-ide-foundations` spec. `AIPanel.tsx` remains untouched.

## Architecture Decisions

| Choice | Alternative | Rationale |
|---|---|---|
| Main-only issuers/owners | Renderer paths or dual readers | One revocation and cutover truth. |
| Operation-specific effects | Generic policy callback | Prevents authorized handles being reused for another verb. |
| Required Windows native helper | Node prefix/`realpath` checks | Node cannot prove no-follow component and file identity across races. |
| Serialized durable recovery | Renderer prompt only | Preserves latest accepted edit across crashes. |

## Authority Contract

```ts
type Operation =
  | 'workspace.select'|'project.create'|'fs.read'|'fs.readBinary'|'fs.list'|'fs.watch'|'fs.unwatch'|'fs.create'|'fs.write'|'fs.atomicReplace'|'fs.deleteRecursive'|'fs.rename'
  | 'agent.read'|'agent.list'|'agent.glob'|'agent.grep'|'agent.write'|'agent.edit'|'agent.gitStatus'|'agent.gitDiff'
  | 'git.status'|'git.repositories'|'git.diff'|'git.show'|'git.branch'|'git.log'|'git.commitFiles'|'git.aheadBehind'|'git.stage'|'git.unstage'|'git.commit'|'git.push'|'github.pr'
  | 'terminal.create'|'terminal.sshIdentity'|'terminal.write'|'terminal.resize'|'terminal.close'|'terminal.history'
  | 'lsp.open'|'lsp.change'|'lsp.save'|'lsp.completion'|'external.path'|'external.url'
  | 'store.settings'|'store.workspace'|'store.ssh'|'store.chat'|'store.engineHistory'|'vault.status'|'vault.put'|'provider.models'|'provider.chat'
  | 'transition.tab'|'transition.workspace'|'transition.window'|'transition.app'|'transition.updater';
type TargetRef = {kind:'path',id:string}|{kind:'repository',id:string}|{kind:'urlPolicy',id:string}|{kind:'workspaceStore',workspaceId:string,key:string}|{kind:'credential',id:string}|{kind:'terminal',id:string}|{kind:'document',id:string}|{kind:'transition',id:string};
type Root = {workspaceId:string;canonicalPath:string;identity:{volume:string;fileId:string};source:'directory-dialog'|'restored-main-record';ownerWebContentsId:number;epoch:number};
type GrantProvenance = {grantId:string;issuer:'WorkspaceAuthority'|'DirtyTransitionCoordinator'|'SecretVault';issuedByHandler:string;issuedAt:number;webContentsId:number;epoch:number;operation:Operation;target:TargetRef;scope:'exact'|'subtree'};
type AuthorizedTarget = {root:Root;grant:GrantProvenance;target:TargetRef;preparedIdentity:string};
interface PathEffects {
  read(a:AuthorizedTarget):Promise<Uint8Array>; list(a:AuthorizedTarget):Promise<TargetRef[]>; watch(a:AuthorizedTarget,owner:number):Promise<TargetRef>;
  create(parent:AuthorizedTarget,name:string,kind:'file'|'directory'):Promise<TargetRef>; write(a:AuthorizedTarget,bytes:Uint8Array):Promise<void>;
  atomicReplace(parent:AuthorizedTarget,target:AuthorizedTarget,bytes:Uint8Array):Promise<void>; deleteRecursive(parent:AuthorizedTarget,target:AuthorizedTarget):Promise<void>;
  rename(sourceParent:AuthorizedTarget,source:AuthorizedTarget,destinationParent:AuthorizedTarget,name:string):Promise<TargetRef>;
}
```

Only the named main owner may `issue()`: `WorkspaceAuthority` after a main directory dialog or derivation from an existing grant; `DirtyTransitionCoordinator` after collecting a transition; `SecretVault` after manifest lookup. `issue(issuer,event.sender.id,epoch,operation,target,scope)` stores every argument and returns an opaque grant. Renderer input can narrow, never create or widen, a target. Navigation, destruction, switch/close, `before-quit`, or owner transfer increments epoch and revokes grants. Errors use exactly: `malformed_request`, `workspace_or_grant_revoked`, `owner_epoch_mismatch`, `unsupported_operation`, `unsupported_windows_path`, `target_denied`, `path_race`, `os_failure`, `recovery_capacity_exceeded`, `recovery_corrupt`, `secret_key_unavailable`, `migration_failed`. Precedence follows that order within the applicable subsystem; no earlier stage probes disk. `target_denied` protects workspace-root delete/rename, `.git/**` from non-Git writes/deletes/renames, and any target outside the grant; Git adapters alone may mutate `.git` through fixed argv.

## Path Effects and Platform Seam

`WindowsFsNative` is a required N-API helper wrapping `CreateFileW(FILE_FLAG_OPEN_REPARSE_POINT|FILE_FLAG_BACKUP_SEMANTICS)`, `GetFileInformationByHandleEx(FileIdInfo)`, `GetFinalPathNameByHandleW`, `FlushFileBuffers`, `ReplaceFileW/MoveFileExW`, and handle-relative enumeration/deletion. Production algorithms are distinct:

| Effect | Bound algorithm |
|---|---|
| read/readBinary | No-follow open every component; verify final path/root and IDs; read the already-open target handle. |
| list | Open directory handle; enumerate; reject reparse children; return opaque child refs. |
| watch | Watch opened root handle; bind watcher to sender/epoch; revalidate each event; close on revoke. |
| create | Open nearest existing parent; validate suffix; create one component at a time no-follow; flush parent. |
| write | Open existing target no-follow, verify, write/flush through that handle, recheck parent/target IDs. |
| atomic replace | Create same-parent temp by handle, flush, recheck identities, replace atomically, flush parent. |
| recursive delete | Depth-first handle enumeration; reject all reparses; delete children then target; root/protected denial first. |
| rename | Open source and both parents; require same authorized root/volume; recheck all IDs; handle-relative rename. |
| Git root | Open repository root; fixed `execFile` argv/cwd from authorized handle path; recheck before spawn and after completion. |
| LSP root | Spawn `typescript-language-server` with `shell:false`, authorized root cwd, minimal inherited env; every URI resolves to document ref. |
| Terminal root | Spawn PTY only with authorized cwd; SSH `-i` comes from an exact external-file grant; session ref binds sender/epoch. |

Reject drive-relative, root-relative, UNC, extended/device/NT paths and ADS before filesystem access. Real-Windows tests build junction/symlink/mount-point and parent-swap races on NTFS, assert volume/file IDs and zero escaped effects, and run packaged Electron against the compiled helper; fake-platform tests are necessary but not acceptance evidence.

## IPC Migration (all 57 registrations)

Cutovers: `C1` contracts/owner, `C2` path/process, `C3` recovery, `C4` vault. Deletion gate `D(test)` means remove the old signature/owner only after that named contract and typed-preload compile test pass. Rollback `R1` restores only adapter routing; `R2` keeps v2 owner and disables the feature; `RV` follows vault owner state. All event sends target the initiating `webContentsId`; broadcast via `mainWindow` is deleted.

| Old call | New owner | Operation | Target source | Cutover | Deletion gate | Rollback | Test |
|---|---|---|---|---|---|---|---|
| app:minimize | WindowOwner | UI | sender window | C1 | D(window-owner) | R1 | window-owner |
| app:open-shell | WorkspaceAuthority | external.path | path grant | C2 | D(external-path) | R2 | external-path |
| app:open-external | NavigationPolicy | external.url | fixed scheme/host policy | C2 | D(navigation-policy) | R2 | navigation-policy |
| app:maximize | WindowOwner | UI | sender window | C1 | D(window-owner) | R1 | window-owner |
| app:close | DirtyTransitionCoordinator | transition.window | sender window | C3 | D(close-reentry) | R2 | close-reentry |
| app:zoom-in | WindowOwner | UI | sender window | C1 | D(window-owner) | R1 | window-owner |
| app:zoom-out | WindowOwner | UI | sender window | C1 | D(window-owner) | R1 | window-owner |
| app:zoom-reset | WindowOwner | UI | sender window | C1 | D(window-owner) | R1 | window-owner |
| app:get-info | AppInfoOwner | metadata | constant | C1 | D(typed-window-api) | R1 | typed-window-api |
| updater:install-update | DirtyTransitionCoordinator | transition.updater | dirty-set ref | C3 | D(updater-gate) | R2 | updater-gate |
| fs:select-workspace | WorkspaceAuthority | workspace.select | dialog result | C1 | D(workspace-activation) | R2 | workspace-activation |
| fs:create-project | WorkspaceAuthority | project.create | dialog parent+name | C2 | D(project-create) | R2 | project-create |
| fs:read-dir | FsEffects | fs.list | subtree ref | C2 | D(fs-list) | R2 | fs-list |
| fs:read-file | FsEffects | fs.read | exact ref | C2 | D(fs-read) | R2 | fs-read |
| fs:read-binary-file | FsEffects | fs.readBinary | exact ref | C2 | D(fs-read-binary) | R2 | fs-read-binary |
| fs:write-file | FsEffects | fs.atomicReplace | exact ref | C2 | D(fs-write) | R2 | fs-write |
| fs:create-item | FsEffects | fs.create | parent ref+name | C2 | D(fs-create) | R2 | fs-create |
| fs:delete-item | FsEffects | fs.deleteRecursive | exact ref | C2 | D(fs-delete) | R2 | fs-delete |
| fs:watch-workspace | WatchOwner | fs.watch | root ref | C2 | D(watch-owner) | R2 | watch-owner |
| fs:unwatch-workspace | WatchOwner | fs.unwatch | sender watcher ref | C2 | D(watch-owner) | R2 | watch-owner |
| lsp:open-document | LspAuthority | lsp.open | root+document refs | C2 | D(lsp-authority) | R2 | lsp-authority |
| lsp:change-document | LspAuthority | lsp.change | document ref | C2 | D(lsp-authority) | R2 | lsp-authority |
| lsp:save-document | LspAuthority | lsp.save | document ref | C2 | D(lsp-authority) | R2 | lsp-authority |
| lsp:completion | LspAuthority | lsp.completion | document ref | C2 | D(lsp-authority) | R2 | lsp-authority |
| terminal:create | TerminalAuthority | terminal.create | root ref | C2 | D(terminal-root) | R2 | terminal-root |
| terminal:create-ssh | TerminalAuthority | terminal.sshIdentity | exact identity ref | C2 | D(ssh-identity) | R2 | ssh-identity |
| terminal:write | TerminalAuthority | terminal.write | sender session ref | C2 | D(terminal-owner) | R2 | terminal-owner |
| terminal:resize | TerminalAuthority | terminal.resize | sender session ref | C2 | D(terminal-owner) | R2 | terminal-owner |
| terminal:close | TerminalAuthority | terminal.close | sender session ref | C2 | D(terminal-owner) | R2 | terminal-owner |
| terminal:get-history | TerminalAuthority | terminal.history | sender session ref | C2 | D(terminal-owner) | R2 | terminal-owner |
| store:get-keys | SecretVault | vault.status | manifest | C4 | D(no-plaintext) | RV | no-plaintext |
| store:set-key | SecretVault | vault.put | provider+main secret ingress | C4 | D(vault-put) | RV | vault-put |
| store:get-selected-models | SettingsStore | store.settings | fixed key | C1 | D(settings-store) | R1 | settings-store |
| store:set-selected-model | SettingsStore | store.settings | fixed key | C1 | D(settings-store) | R1 | settings-store |
| store:get-last-workspace | WorkspaceStoreOwner | store.workspace | main workspace record | C1 | D(workspace-store) | R1 | workspace-store |
| store:set-last-workspace | WorkspaceStoreOwner | store.workspace | workspace ref | C1 | D(workspace-store) | R1 | workspace-store |
| store:get-recent-workspaces | WorkspaceStoreOwner | store.workspace | main workspace records | C1 | D(workspace-store) | R1 | workspace-store |
| store:get-ssh-servers | SshSettingsOwner | store.ssh | fixed key | C2 | D(ssh-store) | R2 | ssh-store |
| store:add-ssh-server | SshSettingsOwner | store.ssh | identity ref, not path | C2 | D(ssh-store) | R2 | ssh-store |
| store:get-chat-history | ChatStoreOwner | store.chat | workspace ref | C2 | D(chat-store) | R2 | chat-store |
| store:set-chat-history | ChatStoreOwner | store.chat | workspace ref | C2 | D(chat-store) | R2 | chat-store |
| ai:fetch-models | ProviderGateway | provider.models | credential ref | C4 | D(no-plaintext) | RV | no-plaintext |
| ai:abort-chat | EngineSessionService | provider.chat | sender turn ref | C2 | D(engine-owner) | R2 | engine-owner |
| ai:stream-chat | EngineSessionService | provider.chat | workspace+credential refs | C4 | D(no-plaintext) | RV | no-plaintext |
| git:status | GitAuthority | git.status | repository ref | C2 | D(git-read) | R2 | git-read |
| git:stage | GitAuthority | git.stage | repo+file refs | C2 | D(git-index) | R2 | git-index |
| git:unstage | GitAuthority | git.unstage | repo+file refs | C2 | D(git-index) | R2 | git-index |
| git:diff | GitAuthority | git.diff | repo+optional file ref | C2 | D(git-read) | R2 | git-read |
| git:show-original | GitAuthority | git.show | repo+file ref | C2 | D(git-read) | R2 | git-read |
| git:current-branch | GitAuthority | git.branch | repository ref | C2 | D(git-read) | R2 | git-read |
| git:commit | GitAuthority | git.commit | repo+message | C2 | D(git-commit-state) | R2 | git-commit-state |
| git:log | GitAuthority | git.log | repository ref | C2 | D(git-read) | R2 | git-read |
| git:repositories | GitAuthority | git.repositories | root repository ref | C2 | D(git-selector-authority) | R2 | git-selector-authority |
| git:commit-files | GitAuthority | git.commitFiles | repo+validated object id | C2 | D(git-read) | R2 | git-read |
| git:get-ahead-behind | GitAuthority | git.aheadBehind | repository ref | C2 | D(git-push-state) | R2 | git-push-state |
| git:push | GitAuthority | git.push | repo+resolved destination | C2 | D(git-push-state) | R2 | git-push-state |
| git:create-pull-request | GitHubAuthority | github.pr | repo+validated fields | C2 | D(github-pr-argv) | R2 | github-pr-argv |

`EngineHistoryStore.append/load` is not IPC but migrates from `workspacePath` to workspace ref under `store.engineHistory`; `diagnosticsStore` receives only sender-owned, authorized document refs. `Window.api` is declared in `src/shared/windowApi.ts` and `src/vite-env.d.ts`; all `(window as any)` is deleted at `typed-window-api`. `will-navigate`, `setWindowOpenHandler`, iframe navigation hooks, watcher/LSP/terminal/AI/updater events use sender ownership and drop stale epochs.

## Recovery Protocol

```ts
type RecoveryRecord={workspaceId:string;fileId:string;revision:number;baseHash:string;ciphertext:Uint8Array;createdAt:number;ackedAt?:number};
type GateState='idle'|'collecting'|'awaitingDecision'|'saving'|'discarding'|'approved'|'cancelled'|'blocked';
type GateResult={gateId:string;state:GateState;decision?:'save'|'discard'|'cancel';failures:Array<{fileId:string;code:string}>;approvalRef?:string};
interface DirtyTransitionCoordinator { begin(kind:'tab'|'workspace'|'window'|'app'|'updater',files:string[]):Promise<GateResult>; decide(id:string,d:'save'|'discard'|'cancel'):Promise<GateResult>; consumeOnce(ref:string,kind:string):boolean; rendererLost(sender:number):Promise<void>; }
```

Each file has one main queue. Renderer submits `(revision,baseHash,bytes)`; revision must equal last accepted + 1. Main applies backpressure with one in-flight plus one coalesced pending snapshot, encrypts with AES-256-GCM/AAD over all record metadata, writes record temp, fsyncs, renames, writes/fsyncs manifest, then returns durable ack. Timeout retries reuse `(fileId,revision,baseHash)` idempotently; a different payload for that revision is `malformed_request`. Rejection leaves record/manifest/prune set unchanged and buffer dirty.

Pruning computes a transaction before writing: remove records older than seven days that are acknowledged, then other acknowledged by `(createdAt,revision,fileId)`, then unacknowledged except the newest per dirty file; enforce newest 10/file, 100 total, 2 MiB/file, 20 MiB/workspace. The newest unacknowledged record per dirty file is protected. If limits still fail, reject `recovery_capacity_exceeded` atomically. Save writes every selected buffer with `fs.atomicReplace`; only all successful disk fsyncs are acknowledged. Partial save reports per-file failures, acknowledges successful files, but keeps the whole transition blocked and failed files dirty. Discard deletes selected records/manifests durably before clearing dirty state.

Restore validates envelope/version/workspace/file/revision/baseHash/AAD/ciphertext, quarantines corrupt files by atomic rename, chooses highest valid revision, warns on fallback, and restores nothing if none validates. Missing `safeStorage` at startup preserves ciphertext, reports `secret_key_unavailable`, offers no plaintext restore, and allows ordinary opening; dirty destructive transitions remain gated and may proceed only after successful disk save or explicit durable discard.

| Entry | First interception | Re-entry / failure |
|---|---|---|
| Tab close | Renderer calls `begin(tab)` before state removal. | One approval closes named tab; failure/cancel changes nothing. |
| Workspace switch | Main reserves candidate, current workspace remains owner. | Approval revokes epoch then activates; failure restores current projection. |
| BrowserWindow `close` | `preventDefault`; main begins window gate. | One approvalRef permits one repeated `close`; later close regates. |
| `before-quit`/OS quit | `preventDefault`; one app gate covers all windows. | Approval calls `app.quit` once; failure clears quitting flag. |
| Updater | Do not clear services or call `quitAndInstall`. | Approval alone shuts down services and installs; failure/cancel does neither. |
| Renderer loss | Main marks gate blocked; no synthetic discard/approval. | Journal survives; forced process death restores next start. |

## Vault Protocol

Manifest owner selection occurs under an exclusive create-new lock containing pid/start/nonce; live lock blocks, stale lock is removed only after process-liveness and age checks. Manifest revision uses compare-and-swap so concurrent mutation returns `migration_failed`. Zero entries atomically publishes an empty vault owner and removes empty `apiKeys`. Provider, credentialRef, and `authType:'api'|'oauth'` are authenticated metadata and preserved exactly.

| Durable state at crash | Startup action |
|---|---|
| no intent / legacy present | Legacy is sole main reader; retain verified staged entries. |
| intent + staging temp | Delete orphan temp; legacy remains owner. |
| published, not verified | Decrypt-verify; retain on success, quarantine/delete failed publication; legacy owns. |
| verified staged | Preserve and skip on retry; legacy owns until all verify. |
| plaintext-removal intent + plaintext present | Resume verification/removal; legacy owns. |
| plaintext removed + activation absent | Require all verified, atomically activate vault; never recreate plaintext. |
| active manifest | Vault is sole reader; clean stale temps/intent. |

Validation/config/encryption failures remove only that entry’s temp, never verified staging. Manifest and config writes use same-directory temp, fsync, atomic rename, directory fsync. `safeStorage` unavailable preserves every durable state and returns `secret_key_unavailable`; post-cutover cannot fall back to plaintext. Pre-cutover rollback retains legacy plus verified staging for retry; post-cutover rollback selects the last verified encrypted manifest. Temp cleanup is lock-held and manifest-aware.

## Audit, Evidence, and Files

Audit event: `{schemaVersion,at,correlationId,category,operation,outcome,errorCode?,workspaceIdHash?,targetKind,grantIdHash?,senderId,epoch,durationMs,retryCount}`. Never log path, URL query, content, secret, prompt, Git body/message, terminal data, or OS error text. Sink is main-process rotating JSONL under `userData/audit` (10 MiB × 3, 30 days) plus counters for denial/error/latency; renderer gets correlation ID only. Tests assert schema, ordering, rotation/retention, and canary redaction.

| Spec scenario | Evidence |
|---|---|
| WA-C01 | `grant-matrix.test.ts` / `workspace-authority/grant-matrix` |
| WA-C02 | `revocation.test.ts` / `workspace-authority/revocation` |
| WA-C03 | fake + real-Windows `windowsPaths.test.ts` / `workspace-authority/windows-paths` |
| WA-C04 | `errorPrecedence.test.ts` / `workspace-authority/error-precedence` |
| WA-C05 | `agentAuthority.test.ts` / `workspace-authority/unrestricted-command` |
| WR-C01 | `DirtyTransitionCoordinator.test.ts` / `workspace-recovery/tab-save` |
| WR-C02 | `DirtyTransitionCoordinator.test.ts` / `workspace-recovery/workspace-save-failure` |
| WR-C03 | `DirtyTransitionCoordinator.test.ts` / `workspace-recovery/app-discard-failure` |
| WR-C04 | `DirtyTransitionCoordinator.test.ts` / `workspace-recovery/updater-cancel` |
| WR-C05 | `DirtyTransitionCoordinator.test.ts` / `workspace-recovery/close-reentry` |
| WR-C06 | `RecoveryDecisionProjection.test.tsx` / `workspace-recovery/accessible-decision` |
| WR-C07 | `RecoveryStore.test.ts` / `quota-pruning-overflow` |
| WR-C08 | restart/fsync `RecoveryRestore.test.ts` / `restore-corruption` |
| WR-C09 | process-kill `RecoveryRestore.test.ts` / `crash-preservation` |
| CV-C01 | `SecretVault.test.ts` plus packaged Electron / `credential-vault/plaintext-boundary` |
| CV-C02 | `SecretVault.test.ts` / `credential-vault/safe-storage-unavailable` |
| CV-C03 | `CredentialMigration.test.ts` / `credential-vault/partial-failure` |
| CV-C04 | `CredentialMigration.test.ts` / `credential-vault/retry` |
| CV-C05 | `CredentialMigration.test.ts` plus restart / `credential-vault/cutover` |
| CV-C06 | `CredentialMigration.test.ts` plus restart / `credential-vault/rollback` |

Fakes: `FakeWindowsFsNative`, `FakeSafeStorage`, `FakeDurableWriter`, `FakeClock`, `FakeProcessLiveness`, `FakeIpcSender`, `FakeUpdater`, `FakeBrowserWindow`. Real integration seams: NTFS race helper, packaged Electron sender/navigation lifecycle, child-process crash/restart, power-loss checkpoints after each fsync/rename, and OS `safeStorage` availability.

| Action | Exact files |
|---|---|
| Create | `src/shared/securityContracts.ts`, `src/shared/windowApi.ts`; `src/main/security/{WorkspaceAuthority,PathEffects,WindowsFsNative,GitAuthority,GitHubAuthority,LspAuthority,TerminalAuthority,WatchOwner,NavigationPolicy,AuditSink}.ts`; `src/main/owners/{WindowOwner,AppInfoOwner,SettingsStore,WorkspaceStoreOwner,SshSettingsOwner,ChatStoreOwner,ProviderGateway}.ts`; `src/main/ipc/registerIpc.ts`; `native/windows-fs/{binding.cc,binding.gyp,index.ts}`; `src/main/recovery/{RecoveryStore,DirtyTransitionCoordinator}.ts`; `src/main/vault/{SecretVault,CredentialMigration}.ts`; `src/renderer/features/recovery/RecoveryDecisionProjection.tsx` |
| Modify | `package.json`, `src/main/{index,agentRunner,terminal,lspManager}.ts`, `src/main/engine/{types,EngineSessionService,SpigotChatsEngineAdapter,historyStore}.ts`, `src/preload/index.ts`, `src/vite-env.d.ts`, `src/renderer/main.tsx`, stores `{workspaceStore,terminalStore,aiStore,diagnosticsStore}.ts`, features `title-bar/TitleBar.tsx`, `sidebar/{FileTree,Sidebar,SourceControlView}.tsx`, `editor/{EditorTabs,EditorContainer,lspMonacoBridge}.ts(x)`, `keyboard/useGlobalShortcuts.ts`, `agent-mode/AgentModeView.tsx`, `ai-panel/{contextCompiler,ApiKeyModal}.tsx`, `settings/SettingsModal.tsx`, `tests-e2e/app.spec.ts` |
| Tests | Colocated tests for every created owner/helper plus `tests-integration/windowsFs.real.test.ts`, `tests-integration/recoveryRestart.test.ts`, `tests-integration/vaultRestart.test.ts`, `tests-integration/ipcInventory.test.ts` |
| Preserve | `src/renderer/features/ai-panel/AIPanel.tsx` |

## Threat Matrix

| Boundary | Applicability, safe/failure behavior, unchanged RED test |
|---|---|
| Documentation-like paths | N/A: no executable classifier; unrestricted `run_command` is denied. |
| Git repository selection | Applicable: fixed argv and authorized root/submodule only; relative/absolute/`git -C` escape gets `target_denied`; `git-selector-authority`. |
| Commit state | Applicable: explicit staged index, no `commit -a`; empty index is typed OS failure with no mutation; `git-commit-state`. |
| Push state | Applicable: tracking ref or validated first-push destination; unresolved destination fails before spawn; `git-push-state`. |
| PR commands | Applicable: fixed `execFile` argv, no environment prefix/composed command/renderer `--head`; invalid form is `malformed_request`; `github-pr-argv`. |

## Migration / Rollout

Auto-chain within 4,000 changed lines: C1 contracts, C2 authority/adapters/native proof, C3 recovery, C4 vault, then Electron evidence. Each slice lands only after its deletion gate; no raw-path/plaintext compatibility owner remains. No data migration beyond journal/vault formats above.

## Open Questions

None.
