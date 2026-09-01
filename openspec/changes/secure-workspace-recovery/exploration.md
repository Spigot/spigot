## Exploration: Secure workspace recovery

### Current State
Spigot currently treats renderer-supplied paths and workspace strings as authority. There is no main-process workspace identity, owner binding, epoch, target-specific grant, or common error contract. `src/main/index.ts` exposes 57 IPC handlers/listeners; the privileged subset is spread across filesystem, Git/GitHub, terminal, LSP, storage, AI/provider, updater, and shell-opening code. Most handlers ignore `event.sender`, while watcher ownership is the sole partial exception.

The current privileged-call inventory for this child is:

| Boundary | Current calls | Required containment seam |
|---|---|---|
| Workspace entry and filesystem | `fs:select-workspace`, `fs:create-project`, `fs:read-dir`, `fs:read-file`, `fs:read-binary-file`, `fs:write-file`, `fs:create-item`, `fs:delete-item`, `fs:watch-workspace`, `fs:unwatch-workspace` | Dialog selection creates a main-owned workspace identity. Every later call uses an opaque workspace reference and an operation/target grant; project creation outside the active root requires a separate dialog-derived parent grant. |
| Agent tools | `edit_file`, `glob_search`, `list_dir`, `read_file`, `write_file`, `grep_search`, `git_status`, `git_diff`, `run_command` in `executeTool` | Route all file and Git targets through the same authority. Unrestricted shell strings cannot be made workspace-contained merely by setting `cwd`; `run_command` must fail closed unless replaced by a separately specified allowlisted execution operation. |
| Git and GitHub | `git:status`, `repositories`, `diff`, `show-original`, `current-branch`, `commit`, `log`, `commit-files`, `get-ahead-behind`, `push`, `stage`, `unstage`, `create-pull-request` | Bind repository roots/submodules to the active workspace and grant read/index/commit/network/PR operations separately. Replace interpolated `exec` uses with argument-vector execution; a valid `cwd` does not neutralize interpolated file paths or hashes. |
| Terminal paths | `terminal:create` accepts arbitrary `cwd`; `terminal:create-ssh` accepts an arbitrary `identityFile` | Authorize local terminal `cwd` against the active workspace. Treat SSH identity files as explicit external-file references or reject them without a trusted grant. Terminal host/attach, history, write, resize, and close protocols remain deferred. |
| LSP | `lsp:open-document`, `change-document`, `save-document`, `completion` accept renderer `workspacePath` and file URIs | Resolve the LSP root from workspace identity, not request data, and require every document URI to map to an authorized in-workspace target. LSP supervision remains deferred. |
| External path/URL entry | `app:open-shell`; recent/last workspace and workspace-keyed chat store calls; renderer `target="_blank"` links; BrowserTab HTTP(S) input/iframe popups; SSH identity paths | Authorize shell paths and workspace-keyed records. Install main-window navigation/new-window guards and an explicit external-URL scheme/host policy; direct links currently bypass the narrow `app:open-external` prefix check. Browser redesign is not required. |
| Secrets and provider calls | `store:get-keys`, `store:set-key`, `ai:fetch-models`, `ai:stream-chat` transport plaintext keys through renderer; `electron-store-config.json` stores them plaintext | Renderer receives only provider configuration state and opaque credential references. Main resolves credentials for provider calls. Non-secret settings may remain in the existing store. |
| Loss-producing transitions | `workspaceStore.closeFile`, `setWorkspacePath`, title-bar/app close, `window-all-closed`, and `updater:install-update` | One dirty-state coordinator must gate tab close, workspace switch, window/app close, and updater exit with save/discard/cancel. Current calls clear buffers or terminate immediately. |

Windows containment is not a prefix test. Existing handlers and agent tools accept absolute paths, `..`, drive-relative forms such as `C:foo`, separator/case variants, and paths traversing links. The authority needs one policy for existing and non-existing targets: allow only local absolute drive paths; reject drive-relative, root-relative, UNC, `\\?\`/`\\.\`/NT-device, and alternate-data-stream forms; normalize separators and drive casing; compare root equality or `root + separator`, never string prefix. Existing targets require canonical root/target resolution. Non-existing targets require canonicalizing the nearest existing ancestor and validating each remaining component. Reads, creates, writes, renames, and deletes must revalidate opened handles/parent identity around the side effect so symlink, junction, mount-point, or other reparse replacement races return `path_race` rather than escaping.

Dirty data currently exists only in renderer memory (`fileBuffers` plus `dirtyFiles`). Tab close drops the dirty marker, workspace switch clears all buffers before work is preserved, and app/updater exits kill processes without coordination. There is no crash journal. The recovery design must therefore persist encrypted, versioned records incrementally, before destructive transitions, rather than trying to ask a crashed renderer for its last state.

Credential state is similarly unsafe. `store:get-keys` returns all plaintext values, `aiStore` keeps them in provider state, settings repopulate visible inputs from that state, and both provider calls receive raw keys. `safeStorage` migration has no existing seam, and the current store writer is neither locked nor atomic.

Existing proof is insufficient: `workspaceStore.test.ts` only covers delayed/failed open, engine permission tests cover a turn-local broker rather than workspace grants, and Playwright only checks the header. There are no path-policy, sender/epoch revocation, recovery, close-reentry, migration rollback, or privileged-inventory contract tests. The unrelated modified `src/renderer/features/ai-panel/AIPanel.tsx` must remain untouched.

### Affected Areas
- `src/main/index.ts` — central IPC inventory, workspace/store state, provider calls, shell/URL entry, updater, and close lifecycle currently lack one authority.
- `src/preload/index.ts` — migrate broad path/key APIs to typed workspace references, capability-bearing requests, credential references, and recovery decisions.
- `src/main/agentRunner.ts` — route every tool path through authority and fail closed for unrestricted shell execution.
- `src/main/terminal.ts` — consume an authorized local cwd; SSH identity path needs an explicit external-file policy without redesigning terminal lifecycle.
- `src/main/lspManager.ts` — derive roots from authority and validate document URIs at the existing privileged boundary.
- `src/main/engine/EngineSessionService.ts` and `src/main/engine/PermissionBroker.ts` — current turn permissions are not workspace capabilities; use an adapter seam without expanding the chat protocol.
- `src/renderer/store/workspaceStore.ts` — replace discard-prone close/switch actions with coordinated save/discard/cancel and recovery projection state.
- `src/renderer/store/aiStore.ts`, `src/renderer/features/settings/SettingsModal.tsx`, and `src/renderer/features/ai-panel/ApiKeyModal.tsx` — remove renderer-owned secret values and consume configured/reference state.
- `src/renderer/features/editor/EditorTabs.tsx` and `src/renderer/features/title-bar/TitleBar.tsx` — enter the same dirty gate for tab, workspace, app, and updater transitions.
- `src/renderer/features/editor/EditorContainer.tsx` — preserve the browser UI while routing external navigation/new-window behavior through main policy.
- `src/renderer/features/sidebar/Sidebar.tsx` and `src/renderer/features/sidebar/SourceControlView.tsx` — stop supplying authoritative workspace/repository paths; retain existing product behavior.
- `tests-e2e/app.spec.ts`, colocated unit tests, and new main/preload contract fixtures — add deterministic boundary, migration, recovery, and lifecycle proof.

### Approaches
1. **Main-owned authority with narrow compatibility adapters** — Introduce `WorkspaceAuthority`, `PathPolicy`, `RecoveryStore/RecoveryGate`, and `SecretVault`; adapt existing preload/store consumers to typed v2 requests while each legacy signature has exactly one authorized translation path.
   - Pros: Fixes the shared root across all privileged calls; binds `{workspaceId, webContentsId, epoch, operation, target}`; centralizes Windows and error behavior; creates testable seams without redesigning terminal, chat, search, or LSP products.
   - Cons: Touches many boundaries and requires strict one-owner cutovers; unrestricted agent commands must be denied or separately specified rather than cosmetically “contained” by cwd.
   - Effort: High

2. **Handler-local validation and renderer prompts** — Add path checks, confirmations, and secret encryption independently to current handlers and views.
   - Pros: Smaller initial edits and fewer new service abstractions.
   - Cons: Repeats policy, leaves sender/workspace races, cannot safely contain arbitrary shell commands, creates contradictory close flows, and makes migration/error precedence impossible to prove consistently.
   - Effort: Medium initially, High cumulatively

### Recommendation
Use the main-owned authority approach and carry only compatibility adapters—not parallel authority. Create a workspace after trusted directory selection as `{workspaceId, canonicalRoot, rootIdentity, webContentsId, epoch}`. Grants are opaque, operation-specific, and target-specific (exact target or declared subtree scope); authorization also checks the actual `event.sender.id`. Increment the epoch and revoke all grants on workspace switch/close, renderer navigation or destruction, and app shutdown. In-flight operations must capture the epoch and recheck it immediately before side effects.

Freeze one error precedence for proposal/spec work: malformed request → unknown/revoked workspace or grant → owner/epoch mismatch → unsupported operation → unsupported Windows path form → target/grant mismatch or protected target → containment/reparse race → OS failure. Earlier failures must not probe target existence, and all errors need stable codes with redacted details.

Use one recovery gate for all four transitions. `save` writes every selected dirty buffer, acknowledges recovery only after disk success, and blocks the transition on any failure; `discard` explicitly deletes the selected recovery state before proceeding; `cancel` leaves state and transition unchanged. Window close must prevent default once, await the renderer decision, then use a one-shot main-issued approval for re-entry. Updater install goes through the same gate. If the renderer is unavailable, normal exit cannot claim successful discard; crash recovery remains for the next launch.

Adopt one deterministic journal bound in the child contract instead of the parent's conflicting limits. A viable baseline is the existing design's 20 MiB per workspace, 2 MiB per file, 100 total revisions, newest 10 revisions per file, and seven-day retention. Prune acknowledged records first. Never silently evict the only unacknowledged revision; if only protected records remain, reject the new snapshot with `recovery_capacity_exceeded`, keep the buffer dirty, and block destructive transitions until save or explicit discard. On restore, verify envelope/version/workspace/file identity and ciphertext, quarantine corrupt records, choose the newest valid revision deterministically, and warn when falling back; no valid record means no automatic restore.

Migrate credentials per entry under a vault lock: validate provider/key shape, encrypt to a temporary per-entry record with `safeStorage`, atomically publish it, decrypt-verify it, and record migration state. Keep the legacy config unchanged until every entry verifies; the final atomic commit removes `apiKeys` and activates the vault manifest. A partial failure removes only failed temporary data and remains retryable. Pre-cutover rollback reads the untouched legacy owner; post-cutover rollback switches to the verified encrypted reader and never recreates plaintext. If secure storage is unavailable, preserve existing data, expose a typed blocked state, and do not return plaintext to the renderer.

Deliver this child as auto-chained review slices within the 4,000-line budget: (1) authority/contracts and Windows fixtures, (2) filesystem/tool/Git/terminal-cwd/LSP/external-boundary conversion, (3) recovery gate/journal, (4) vault/provider migration, and (5) component/Electron evidence. Each slice needs one owner, a reversible cutover, and named tests. Do not modify unrelated `AIPanel.tsx` work or implement terminal attach, addressed chat turns, managed search/commands/LSP supervision, or visual redesign.

### Risks
- Node path normalization alone cannot close reparse replacement races; the implementation may need a small platform-specific filesystem seam and must prove handle/parent identity under injected race tests.
- Arbitrary agent shell commands can access outside the workspace despite a contained cwd; pretending otherwise would leave the central invariant false.
- A renderer-only dirty prompt is not crash recovery, while a main-only gate without incremental snapshots cannot recover the latest edits; the protocol must establish one monotonic revision owner.
- Recovery encryption uses the user OS context, but size/retention, corruption fallback, and secure-storage-unavailable behavior still require explicit deterministic contracts.
- Per-entry credential migration can leave mixed state; only a manifest/lock and verified final cutover prevent dual readers or plaintext restoration.
- Git submodules, worktrees, hooks, external helpers, and repository paths complicate the meaning of “workspace-contained”; proposal/spec must distinguish path authority from subprocess sandboxing.
- The parent artifacts contain useful evidence but failed twice and include conflicting recovery bounds, incomplete capability operations, and unresolved cross-child contracts; they must not be copied as implementation-ready requirements.

### Ready for Proposal
Yes. The child is narrow enough for proposal work if the proposal freezes the authority tuple and revocation events, exact privileged-call migration table, Windows/reparse policy, error precedence, unrestricted-command decision, recovery bounds/overflow/restore rules, and credential migration state machine. The orchestrator should state that this proposal supersedes only the first safety/recovery slice of the blocked parent; all explicit non-goals remain deferred, and no product implementation may begin from the parent artifacts.
