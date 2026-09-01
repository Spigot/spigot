# Proposal: Harden IDE Foundations

## Intent

Spigot users can lose work, cross trust boundaries, or receive stale/misdirected output because privileged operations, editor state, terminals, chat turns, and IDE services lack authoritative ownership. Deliver one phased hardening program that makes safety and lifecycle guarantees observable, recoverable, and independently reviewable.

## Scope

### In Scope
- Enforce workspace containment, operation capabilities, protected secrets, and save/discard/cancel plus bounded crash recovery.
- Give terminal sessions deterministic ownership, ordered attachment, reconciliation, resize, and disposal.
- Preserve addressed structured chat turns, permissions, attachments, dirty-buffer context, cancellation, errors, and shared behavior across views.
- Add command-registry, cancellable search, managed LSP, versioned persistence, and contract/component/E2E proof.

### Out of Scope
- Broad cosmetic redesign or unrelated UX expansion.
- New languages, agent features, or search ranking beyond lifecycle/safety foundations.
- Replacing unrelated approved `AIPanel.tsx` worktree changes.

## Capabilities

### New Capabilities
- `ide-safety-recovery`: Privileged-operation containment, secret migration, and loss prevention.
- `terminal-lifecycle`: Continuous, ordered, reconcilable terminal sessions.
- `conversation-turns`: Addressed, durable, permission-aware chat turns and context.
- `managed-ide-services`: Commands, search, LSP, persistence, and lifecycle proof.

### Modified Capabilities
None; no existing OpenSpec capabilities are present.

## Invariants and Approach

- Main-process policy, not prompts or renderer state, authorizes paths and capabilities.
- Dirty data is never discarded without save/discard/cancel; recovery data is protected and bounded.
- Each terminal/conversation/process has one owner; events are addressed and ordered; disposal is deterministic.
- Deliver autonomous `auto-chain` slices: (1) safety/recovery, (2) terminal, (3) chat, (4) IDE services, (5) cross-cutting E2E proof. Each slice carries named tests, migration/cutover, rollback, and stays within the 4,000-line review budget.
- First slice excludes terminal/chat redesign except the minimum shared IPC/persistence boundary required for containment and recovery.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/main`, `src/preload` | Modified | Policy, protocols, secrets, PTY/search/LSP ownership |
| `src/renderer/features`, `src/renderer/store` | Modified | Recovery and lifecycle consumers; preserve current `AIPanel.tsx` edits |
| `tests-e2e`, colocated tests | Modified | Named regression and workflow evidence |

## Migration, Risks, and Rollback

- Migrate secrets and versioned state without renderer exposure or silent loss; use explicit one-owner cutovers so legacy/new channels cannot duplicate events.
- High risks: Windows path/symlink escape, plaintext recovery leakage, history/live gaps, orphan processes, and oversized coupled reviews.
- Roll back per slice by reverting its consumer-first cutover and restoring the prior adapter/state version; retain reversible credential/state migration until evidence passes.

## Success Criteria

- [ ] Tests prove path escape/permission denial, dirty tab/workspace/app-exit recovery, and secret migration.
- [ ] Tests prove terminal continuity/reload/order/resize/close and cross-conversation cancel/error/attachment routing.
- [ ] E2E proves command palette, cancellable search, LSP restart/shutdown, and no orphaned processes.
- [ ] Every chain slice is independently reversible; no broad redesign or unrelated `AIPanel.tsx` change enters scope.
