# managed-ide-services Specification

## Purpose
Provide deterministic commands and search, supervised LSPs, and safe persistence.

## Requirements

### Requirement: Define the command and search contracts
Each command MUST have unique `commandId`, label, enabled status, argument schema, and action result. Unknown, disabled, or duplicate commands MUST return typed errors and MUST NOT execute. Search MUST use integer `limit` 1–1000 (default 100), cancellation, and path/line/column ascending order.

#### Scenario: Unknown command is rejected
- GIVEN no registry entry matches a command ID
- WHEN it is invoked
- THEN no action runs and an actionable unknown-command error returns.

#### Scenario: Disabled command is inert
- GIVEN a registered command is disabled
- WHEN it is invoked
- THEN no action runs and its disabled reason returns.

#### Scenario: Duplicate command registration is rejected
- GIVEN a command ID is already registered
- WHEN it is registered again
- THEN the second registration is rejected without replacing the first.

#### Scenario: Search limits are numeric and stable
- GIVEN a search request contains a limit outside integer range 1–1000
- WHEN it is validated
- THEN the request is rejected before searching.

#### Scenario: Search cancellation is clean
- GIVEN a search has started
- WHEN it is cancelled
- THEN no later result from that search is published.

### Requirement: Supervise LSP lifecycle
Each LSP MUST have one workspace owner, retry at most 3 times with 100/250/500 ms backoff, and report unavailable after exhaustion. Workspace disposal MUST stop its servers; shutdown MUST wait 2 seconds, then force-kill and report completion.

#### Scenario: Restart uses bounded retry
- GIVEN an LSP exits unexpectedly
- WHEN restart is requested
- THEN attempts use 100, 250, and 500 ms backoff and stop after the third attempt.

#### Scenario: Shutdown leaves no orphan
- GIVEN an LSP ignores shutdown
- WHEN 2 seconds elapse
- THEN it is force-killed before workspace disposal completes.

#### Scenario: Workspace disposal stops its LSPs
- GIVEN a workspace has running LSPs
- WHEN the workspace is disposed
- THEN all owned LSPs reach stopped state before disposal completes.

### Requirement: Migrate and recover persisted state
State MUST be versioned, validated, and single-owner. Corruption MUST fall back to the last valid snapshot; migration failure MUST roll back to the prior version and preserve data; legacy removal requires contract, component, and E2E evidence.

#### Scenario: Corruption uses fallback
- GIVEN the current snapshot is invalid and a prior snapshot is valid
- WHEN state loads
- THEN the prior snapshot loads and an actionable recovery notice appears.

#### Scenario: Migration failure rolls back
- GIVEN a state migration fails validation
- WHEN the failure is recorded
- THEN the prior version remains the sole writable state.

### Requirement: Make slice cutovers reversible
Ownership is explicit per slice: safety/recovery owns workspace data and grants; terminal owns sessions and sequences; conversation owns turns and history; services owns commands, search, LSPs, and state; proof owns evidence. Each cutover MUST stop the prior owner before enabling the next, use one emitter/writer, and roll back to the prior readable state without silent loss.

| Slice | Cutover | Rollback |
|---|---|---|
| Safety/recovery | authority owns grants and records | prior state reader resumes |
| Terminal | session owner owns output | retained history restores prior adapter |
| Conversation | turn owner owns events | legacy owner becomes sole emitter |
| Services | registry/process owner owns jobs | prior service state remains readable |
| Proof | evidence owner records gates | no product state changes |

#### Scenario: Slice rollback preserves state
- GIVEN a slice fails its evidence gate
- WHEN rollback is selected
- THEN the prior owner resumes and retained state remains readable.

## Planned Evidence Mapping
| Scenarios | Contract | Component | E2E |
|---|---|---|---|
| containment, save failure, secret retry | `tests/contracts/ipc-v1.test.ts::rejects_unauthorized_capability` | `tests/components/recovery-gates.test.tsx::blocks_exit_on_save_failure` | `tests-e2e/harden-ide-foundations/safety-recovery.spec.ts::restores_dirty_workspace_after_crash` |
| terminal create, attach, duplicate, gap | `tests/contracts/terminal-v1.test.ts::enforces_attach_cursor` | `tests/components/terminal-controls.test.tsx::selects_active_terminal_accessibly` | `tests-e2e/harden-ide-foundations/terminal-attach-resize-dispose.spec.ts::replays_buffer_once` |
| resize, SSH reconciliation, timeout | `tests/contracts/terminal-v1.test.ts::requires_disposal_deadline` | `tests/components/terminal-controls.test.tsx::announces_disconnected_state` | `tests-e2e/harden-ide-foundations/terminal-attach-resize-dispose.spec.ts::reconciles_ssh_and_forces_disposal` |
| address, attachment, revision | `tests/contracts/conversation-v1.test.ts::routes_by_turn_address` | `tests/components/chat-permission-status.test.tsx::rejects_stale_buffer_context` | `tests-e2e/harden-ide-foundations/conversation-routing-cancel.spec.ts::isolates_attachments_by_turn` |
| grant, denial, cancel, race, status | `tests/contracts/conversation-v1.test.ts::emits_one_terminal_state` | `tests/components/chat-permission-status.test.tsx::denies_requested_tool_accessibly` | `tests-e2e/harden-ide-foundations/conversation-routing-cancel.spec.ts::cancels_only_target_turn` |
| command and search | `tests/contracts/services-v1.test.ts::rejects_unknown_command` | `tests/components/command-search.test.tsx::renders_deterministic_results` | `tests-e2e/harden-ide-foundations/palette-search-lsp-persistence.spec.ts::cancels_search_without_stale_results` |
| LSP retry, shutdown, disposal | `tests/contracts/services-v1.test.ts::enforces_lsp_shutdown_deadline` | `tests/components/service-status.test.tsx::shows_lsp_unavailable` | `tests-e2e/harden-ide-foundations/palette-search-lsp-persistence.spec.ts::shuts_down_lsp_without_orphan` |
| migration, corruption, fallback | `tests/contracts/services-v1.test.ts::rejects_invalid_state_version` | `tests/components/persistence-recovery.test.tsx::offers_last_valid_snapshot` | `tests-e2e/harden-ide-foundations/palette-search-lsp-persistence.spec.ts::loads_migrated_state_or_fallback` |
