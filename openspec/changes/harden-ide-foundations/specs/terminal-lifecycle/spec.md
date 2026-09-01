# terminal-lifecycle Specification

## Purpose
Make local and SSH sessions addressable, ordered, reconnectable, and disposable.

## Requirements

### Requirement: Define terminal identity and sequence ownership
Each terminal MUST have a stable unique `terminalId`, one owner, and one sequence domain beginning at 1. States MUST be `creating`, `running`, `disconnected`, `exited`, or `disposed`; only valid transitions are accepted. Attach MUST be a barrier: return snapshot plus cursor, buffer events through the barrier, then deliver only events with `seq > cursor`.

#### Scenario: Create returns a running identity
- GIVEN a valid workspace and terminal request
- WHEN creation succeeds
- THEN one `terminalId` is returned in `running` state.

#### Scenario: Attach closes the replay gap
- GIVEN output was emitted while detached
- WHEN the client attaches
- THEN the snapshot and cursor are returned before buffered output is delivered once.

#### Scenario: Duplicate output is ignored
- GIVEN an event sequence already accepted
- WHEN the same sequence arrives again
- THEN it is delivered zero additional times.

#### Scenario: Sequence gap requests reconciliation
- GIVEN the next received sequence is greater than expected
- WHEN it is processed
- THEN live delivery pauses and a reconciliation is requested.

### Requirement: Reconcile resize, SSH loss, and disposal
Resize MUST acknowledge the applied dimensions; SSH disconnect MUST be observable as `disconnected` and reconnection MUST reconcile from a cursor. Close MUST be idempotent, await disposal for 2 seconds, then force termination and report `disposed`; no terminal process may remain.

#### Scenario: Resize succeeds
- GIVEN a running terminal and valid dimensions
- WHEN resize is requested
- THEN the terminal reports the applied dimensions.

#### Scenario: SSH disconnect is recoverable
- GIVEN an SSH session loses transport
- WHEN disconnect is detected
- THEN the session enters `disconnected` without accepting output as live.

#### Scenario: SSH reconnect reconciles output
- GIVEN a disconnected SSH session has a retained cursor
- WHEN transport reconnects
- THEN missing output is reconciled before live output resumes.

#### Scenario: Disposal timeout is bounded
- GIVEN a terminal does not exit within 2 seconds of close
- WHEN the timeout expires
- THEN the process is force-terminated and the session is `disposed`.

### Requirement: Transfer terminal ownership atomically
Cutover MUST stop the old owner before the new owner attaches; rollback MUST restore the old adapter from retained history, with exactly one emitter.

#### Scenario: Ownership transfer has one emitter
- GIVEN a terminal is transferred
- WHEN the new owner attaches
- THEN events from the old owner are rejected.
