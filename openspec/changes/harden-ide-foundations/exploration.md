## Exploration: Harden IDE foundations

### Current State
Spigot has useful editor, terminal, chat, search, LSP, persistence, Vitest, and Playwright pieces, but ownership and trust boundaries are inconsistent. The reported defects are four systemic root clusters rather than isolated UI bugs.

**Terminal lifecycle.** `ConsolePanel` owns xterm instances in a component ref while React conditionally removes both the entire panel (`if (!isConsoleOpen) return null`) and the terminal-tab subtree. The PTY and xterm objects survive, but their host elements do not. The attempted recovery calls `term.open(el)` again; xterm.js returns early once a terminal already has an element, so it cannot reattach the retained instance. Listener disposal is tied to session close rather than component ownership, and the mounting effect has no unmount cleanup. History is requested before the live data listener is installed, leaving a snapshot/live gap; empty history triggers a synthetic carriage return that mutates the shell to provoke output. Renderer sessions cannot reconcile with backend sessions after renderer reload because no list/snapshot IPC exists. At least four independent effects or click paths call fit/resize, creating duplicate PTY resizes and focus churn.

**Chat protocol and lifecycle.** A structured engine event model with `turnId` exists in `src/main/engine`, but the active renderer bridge flattens it back into global `ai:stream-*` channels and drops tool, permission, history, and bridge events. Every request uses `sessionId: 'default'`; neither requests nor renderer events carry a conversation identifier, and chunk/end handlers consult whichever conversation is active when they fire. Cancel is global, retry is absent, errors do not become durable turn state, and starting a turn aborts any previous global turn. Thinking is encoded inside content with `<think>` text and parsed independently by two large views. `AIPanel` and `AgentModeView` duplicate message rendering, context compilation, send behavior, history navigation, and auto-scroll, but already differ in attachments, stop controls, errors, and modes. `AIPanel` supports local uploads, but text files are injected into prompt prose, only the last image is sent, and `AgentModeView` has a non-functional attachment button. Context compilation reads disk rather than dirty editor buffers, may omit active-file intent, and main-process execution uses the persisted last workspace rather than an explicit conversation workspace. Per-chunk global store updates, repeated markdown/thinking parsing, smooth scrolling, and five-second Git polling increase UI work; interactive popovers and many icon buttons lack combobox/listbox/dialog semantics, labels, and live-region status.

**Privileged-operation safety and loss prevention.** “Chat/read-only” is only a prompt prefix; the backend always submits mode `chat`, legacy tools remain callable, and permission events are not exposed to the renderer. Agent path resolution accepts absolute paths and `..`, while generic filesystem IPC handlers trust arbitrary renderer paths. `run_command` executes an unrestricted shell string. API keys are returned to renderer state and stored plaintext in `electron-store-config.json`. Closing a dirty tab immediately discards its dirty marker, workspace switching clears all buffers, and app close/update paths terminate without save/discard/cancel coordination or crash-recovery snapshots.

**IDE foundations.** Shortcuts are hard-coded in one hook and UI handlers; no command registry or command palette exists. Workspace search recursively materializes the full tree and reads files serially through renderer IPC, so it does not scale like an indexed or ripgrep-backed service. LSP is TypeScript-only, starts implicitly on document open, has no document-close/workspace-close protocol, no restart/backoff/readiness surface, and sends diagnostics globally. Persistence is fragmented across localStorage, a plaintext JSON file, in-memory engine history, and volatile editor buffers. The current E2E suite only launches Electron and checks header text. Unit tests are green (12 files, 52 tests) and TypeScript currently passes, but there are no terminal lifecycle, chat view/store routing, dirty-buffer recovery, IPC containment, command registry, LSP process lifecycle, or meaningful end-to-end workflow tests.

### Affected Areas
- `src/renderer/features/terminal/ConsolePanel.tsx` — xterm host ownership, listeners, history/live handoff, synthetic input, and duplicate resize logic.
- `src/renderer/store/terminalStore.ts` — renderer/backend session reconciliation and explicit session lifecycle state.
- `src/main/terminal.ts` — authoritative PTY registry, ordered output subscription/snapshot, cleanup, and resize deduplication.
- `src/preload/index.ts` — typed, addressed terminal/chat IPC and narrower privileged APIs.
- `src/renderer/store/aiStore.ts` — conversation/turn routing, terminal turn states, retry/cancel, persistence, and stream batching.
- `src/renderer/features/ai-panel/AIPanel.tsx` — one current chat surface, attachments, mode selection, accessibility, and unrelated approved worktree changes that must be preserved.
- `src/renderer/features/agent-mode/AgentModeView.tsx` — duplicated chat behavior to replace with shared conversation primitives rather than a second protocol implementation.
- `src/renderer/features/ai-panel/contextCompiler.ts` — explicit context manifest, dirty-buffer precedence, limits, and workspace-relative identity.
- `src/main/engine/types.ts` — canonical structured conversation/turn event contract.
- `src/main/engine/EngineSessionService.ts` — turn ownership currently global, default-session coupling, cancellation, permissions, and durable history boundaries.
- `src/main/engine/SpigotChatsEngineAdapter.ts` and `src/main/agentRunner.ts` — legacy prose/tool bridge, enforceable capabilities, path containment, and command execution policy.
- `src/main/index.ts` — broad filesystem IPC, plaintext credential storage, global chat bridge, persisted-workspace routing, and unsafe application shutdown paths.
- `src/renderer/store/workspaceStore.ts` — dirty-buffer lifecycle, workspace switching, persistence, and recovery.
- `src/renderer/features/editor/EditorTabs.tsx` and `src/renderer/features/title-bar/TitleBar.tsx` — discard-prone tab/app close and direct command execution paths.
- `src/renderer/features/keyboard/useGlobalShortcuts.ts` — hard-coded shortcuts to migrate behind commands.
- `src/renderer/features/sidebar/Sidebar.tsx` and `src/renderer/features/sidebar/searchEngine.ts` — renderer-bound serial workspace search and replace safety.
- `src/main/lspManager.ts` and `src/renderer/features/editor/lspMonacoBridge.ts` — server/document lifecycle, routing, restart, and shutdown ownership.
- `tests-e2e/app.spec.ts` and colocated unit tests — lifecycle and safety regressions are currently outside the test surface.

### Approaches
1. **Root-invariant phased hardening** — Establish one authoritative lifecycle and typed protocol per subsystem, delivered as chained vertical slices with named regression tests.
   - Pros: Fixes multiple symptoms at their shared root; makes unsafe states unrepresentable; supports the accepted full program; aligns with the 4,000-line review budget through autonomous slices.
   - Cons: Requires compatibility boundaries while old and new chat/terminal paths coexist; cross-process contracts must be designed before UI polish.
   - Effort: High

2. **Surface-by-surface patches** — Keep current ownership and IPC shapes, adding remount workarounds, event filters, prompts, and local guards in each view.
   - Pros: Smaller initial diffs and faster visible changes.
   - Cons: Adds flags and parallel state, cannot make xterm reattach, leaves global stream races and privilege bypasses, duplicates fixes across both chat views, and provides weak loss-prevention guarantees.
   - Effort: Medium initially, High cumulatively

### Recommendation
Use root-invariant phased hardening and reject symptom patches. Sequence the proposal and later task chain by dependency:

1. **Safety and recovery boundary:** canonical workspace-path validator for every filesystem/tool operation; enforceable capability policy for read/write/command operations; OS-backed secret storage with migration; dirty-buffer save/discard/cancel coordination plus crash-recovery snapshots.
2. **Terminal ownership:** one persistent host and xterm owner per live session; an authoritative backend session snapshot; atomic history-plus-live subscription using sequence/cursor semantics; no synthetic input; one resize coordinator; deterministic listener and PTY disposal. Named tests must cover hide/show, panel-tab switch, terminal-session switch, renderer reload reconciliation, output during attach, resize storms, and close races.
3. **Structured chat turns:** preserve `{conversationId, turnId, type, payload}` through preload and renderer; represent content, reasoning, tools, permissions, attachments, error, cancel, and completion as typed events; route by IDs rather than active UI state; share a conversation controller and message renderer between both views. Dirty editor buffers must override disk context, and attachments must be explicit bounded descriptors rather than prompt text.
4. **Scalable IDE services:** introduce a command registry first, then bind shortcuts/palette/UI to it; move workspace search to a cancellable main-process ripgrep/index service; define LSP server and document lifecycle with close/restart/readiness; consolidate versioned persistence.
5. **Proof layer:** keep strict TDD, add contract tests at each IPC boundary, component tests for lifecycle/routing, and Electron E2E journeys for terminal continuity, cross-conversation streaming, permission denial, path escape rejection, dirty-tab/workspace/app-exit recovery, command palette, search cancellation, and LSP restart.

Use `auto-chain` to keep each slice independently reviewable and reversible. The current `AIPanel.tsx` worktree modification is unrelated approved work and must be preserved; subsequent phases should design around the current file rather than reset or overwrite it.

### Risks
- A compatibility bridge can accidentally keep both old global stream channels and new addressed events active, causing duplicate content; migration must have one owner and explicit cutover tests.
- Filesystem containment must account for Windows drive-letter casing, UNC paths, separators, symlinks/junctions, and non-existent write targets; lexical prefix checks are insufficient.
- Dirty-buffer recovery can expose secrets if snapshots are plaintext; recovery storage needs bounded retention, permissions, and encryption or explicit exclusion rules.
- Terminal history/live ordering cannot be solved reliably with timing delays; a sequence-aware backend contract is required.
- Credential migration must avoid returning decrypted secrets to renderer state longer than necessary and must provide rollback without silently losing existing keys.
- The embedded `spigot-chats` code and the current adapter naming may invite premature reuse; the actual runtime path remains the legacy runner unless proven otherwise by integration tests.
- Search and LSP process services introduce cancellation and shutdown obligations; orphan-process and stale-result tests are required.
- The program will likely exceed a single comfortable review despite the 4,000-line budget; chained slices must follow dependency order and keep tests with each root fix.

### Ready for Proposal
Yes. The proposal should define the four root clusters as one hardening program, state the safety and lifecycle invariants first, and require an auto-chained delivery plan with named regression and E2E evidence for each slice. It should explicitly preserve the existing `AIPanel.tsx` worktree change and prohibit product implementation during proposal/design/spec work.
