# conversation-turns Specification

## Purpose
Keep conversation events addressed, ordered, durable, permission-aware, and accessible.

## Requirements

### Requirement: Address turns and preserve revision identity
Every event MUST carry `workspaceId`, `conversationId`, `sessionId`, `turnId`, and a per-turn sequence. The service MUST persist workspace-scoped history. Attachments MUST identify an allowed file and buffer context MUST include `bufferId` plus `revisionId`; stale revisions MUST be rejected.

#### Scenario: Cross-conversation routing is isolated
- GIVEN two addressed turns emit events
- WHEN each event is delivered
- THEN only the matching conversation receives it in sequence order.

#### Scenario: Stale dirty context is rejected
- GIVEN a buffer revision no longer matches the submitted `revisionId`
- WHEN the turn is started
- THEN the context is rejected with a refresh instruction.

#### Scenario: Invalid attachment is rejected
- GIVEN an attachment is outside the workspace or unreadable
- WHEN it is submitted
- THEN the turn is rejected with an actionable attachment error.

### Requirement: Resolve permission and cancellation deterministically
Permission controls MUST expose labelled allow and deny actions and status controls MUST expose queued, running, waiting, completed, cancelled, or failed. Denial MUST run no tool. Cancellation MUST target one turn, revoke its pending permissions, and suppress late events; a completion/cancel race MUST produce one terminal state.

#### Scenario: Permission is granted
- GIVEN a turn requests an allowed tool
- WHEN the user chooses allow
- THEN that tool request is authorized for that turn.

#### Scenario: Permission is denied
- GIVEN a turn requests a tool
- WHEN the user chooses deny
- THEN the tool is not started and the turn reports denial.

#### Scenario: Target cancellation is isolated
- GIVEN turns A and B are running
- WHEN A is cancelled
- THEN B continues and A emits one `cancelled` terminal event.

#### Scenario: Late event is suppressed
- GIVEN a turn is terminal
- WHEN a provider event arrives afterward
- THEN it is ignored.

#### Scenario: Cancellation wins a completion race
- GIVEN completion and cancellation are accepted concurrently for one turn
- WHEN the race is resolved
- THEN exactly one terminal state is persisted.

#### Scenario: Status control is accessible
- GIVEN a turn is waiting for permission
- WHEN a keyboard user inspects its status
- THEN the status and available labelled actions are announced.

### Requirement: Transfer conversation ownership once
Cutover MUST stop legacy emission before structured ownership begins; rollback MUST make legacy the sole emitter while preserving readable history.

#### Scenario: Cutover prevents duplicates
- GIVEN a turn crosses the ownership boundary
- WHEN an event is emitted
- THEN exactly one owner accepts it.
