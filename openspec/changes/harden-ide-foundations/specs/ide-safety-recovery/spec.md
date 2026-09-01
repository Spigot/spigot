# ide-safety-recovery Specification

## Purpose
Contain privileged work, protect secrets, and make dirty-state recovery bounded and reversible.

## Requirements

### Requirement: Enforce operation-scoped workspace capabilities
The authority MUST canonicalize targets and grant capabilities only as `(workspace, owner, operation, target)`. The matrix is `read:file`, `write:file`, `delete:file`, `execute:allowlisted-file`, `git:workspace-repository`, and `secret:vault-entry`; a grant MUST NOT authorize another row. Every grant MUST be revoked on workspace close or owner transfer. It MUST reject traversal, UNC/device paths, ADS, and reparse-point escape. Protected secrets include vault entries and configured `.env`/credential files; values MUST NOT reach renderer, logs, or recovery records.

| Capability | Permitted target | Revoked by |
|---|---|---|
| read/write/delete | canonical workspace file | close or transfer |
| execute | allowlisted workspace file | close or transfer |
| git | canonical workspace repository | close or transfer |
| secret | vault entry only | close or transfer |

#### Scenario: Escaped target is denied
- GIVEN a write target resolves outside the workspace
- WHEN the write is requested
- THEN the operation is denied with no side effect.

#### Scenario: Revoked capability is denied
- GIVEN a capability was revoked by workspace close or owner transfer
- WHEN its owner requests the operation
- THEN the request is rejected as unauthorized.

#### Scenario: Protected secret is withheld
- GIVEN a requested file matches a protected-secret rule
- WHEN a renderer requests its contents
- THEN the value is withheld and a redacted denial is returned.

### Requirement: Gate dirty work and bound recovery
Close, switch, updater exit, and application exit MUST require explicit `save`, `discard`, or `cancel`. Recovery MUST be encrypted, versioned, atomic, workspace-scoped, and capped at 50 MiB or 30 days; pruning MUST report loss rather than silently discard it.

#### Scenario: Save failure preserves work
- GIVEN dirty data and a failing save
- WHEN the user chooses save
- THEN the item remains dirty and an actionable error is shown.

#### Scenario: Discard is explicit
- GIVEN dirty data and a close request
- WHEN the user chooses discard
- THEN the item closes and its dirty data is removed.

#### Scenario: Cancel blocks exit
- GIVEN dirty data during application exit
- WHEN the user chooses cancel
- THEN the application remains open with data intact.

#### Scenario: Recovery restores the latest bound record
- GIVEN a crash and a valid recovery record within the bound
- WHEN the workspace reopens
- THEN that record is offered for restoration.

### Requirement: Migrate secrets without silent loss
Migration MUST validate each entry before encrypted write, support idempotent retry, retain readable legacy data on partial failure, and retire plaintext only after complete verification. Rollback MUST restore the previous owner without deleting the verified copy.

#### Scenario: Partial migration is retryable
- GIVEN one legacy entry fails validation
- WHEN migration runs
- THEN successful entries remain encrypted, the failed entry remains readable only to the migrator, and retry is offered.

#### Scenario: Migration rollback retains verified data
- GIVEN migration cannot complete after encrypted entries were verified
- WHEN rollback is selected
- THEN the legacy owner resumes without deleting the encrypted entries.

#### Scenario: Verified migration retires plaintext
- GIVEN every entry has passed verification
- WHEN migration completes
- THEN plaintext storage is retired and secrets remain inaccessible to the renderer.
