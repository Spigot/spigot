# workspace-recovery Specification

## Purpose and boundary

This child supersedes and withdraws only the `ide-safety-recovery` recovery/loss-prevention slice of `harden-ide-foundations`; parent artifacts and all other parent capabilities remain unchanged. It consumes the parent's shared IPC contract and the `workspace-authority` grants. Recovery records and internal paths are protected targets and remain inaccessible to renderer and agent filesystem operations.

## Requirements

### Requirement: Gate every dirty transition over the complete set

The gate MUST use the complete transition set: **all dirty buffers owned by the tab, workspace, window, or updater transition**, including buffers not currently visible. It MUST offer exactly `save`, `discard`, and `cancel`. Save MUST persist every selected buffer and acknowledge only after its disk write succeeds; one failure blocks the entire transition. Discard MUST delete every selected recovery record before proceeding; one deletion failure blocks. Cancel changes nothing. A window close MUST prevent default once and accept only a one-shot approval bound to `{sender, epoch, transition, dirtySetRevision}`.

| Transition | Save success | Discard success | Cancel | Save failure |
|---|---|---|---|---|
| tab | close tab | close tab | remain open | remain dirty/open |
| workspace | switch | switch | remain active | remain dirty/active |
| window | close | close | remain open | remain dirty/open |
| updater | install | install | do not install | do not install |

#### Scenario: Tab save handles every dirty buffer
- GIVEN a tab transition contains two dirty buffers
- WHEN save succeeds for both buffers
- THEN both are acknowledged before the tab closes
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-01`; `src/main/recovery/RecoveryGate.test.ts#WR-01`; `tests-e2e/app.spec.ts#workspace-recovery/tab-save-all`

#### Scenario: Tab discard removes every record
- GIVEN a tab transition contains two dirty buffers
- WHEN discard deletes both recovery records
- THEN the tab closes with neither record restorable
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-02`; `src/main/recovery/RecoveryGate.test.ts#WR-02`; `tests-e2e/app.spec.ts#workspace-recovery/tab-discard-all`

#### Scenario: Tab cancel changes nothing
- GIVEN a dirty tab close is awaiting a decision
- WHEN cancel is selected
- THEN the tab and all dirty buffers remain unchanged
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-03`; `src/main/recovery/RecoveryGate.test.ts#WR-03`; `tests-e2e/app.spec.ts#workspace-recovery/tab-cancel`

#### Scenario: Tab save failure blocks close
- GIVEN one dirty tab buffer fails to save
- WHEN save is selected
- THEN the tab remains open and every affected buffer remains dirty
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-04`; `src/main/recovery/RecoveryGate.test.ts#WR-04`; `tests-e2e/app.spec.ts#workspace-recovery/tab-save-failure`

#### Scenario: Workspace save succeeds for all buffers
- GIVEN a workspace switch contains all three dirty buffers
- WHEN all three saves succeed
- THEN the workspace switches only after all three acknowledgements
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-05`; `src/main/recovery/RecoveryGate.test.ts#WR-05`; `tests-e2e/app.spec.ts#workspace-recovery/workspace-save-all`

#### Scenario: Workspace discard succeeds for all buffers
- GIVEN a workspace switch contains all three dirty buffers
- WHEN all three recovery records are deleted
- THEN the workspace switches and no selected record remains
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-06`; `src/main/recovery/RecoveryGate.test.ts#WR-06`; `tests-e2e/app.spec.ts#workspace-recovery/workspace-discard-all`

#### Scenario: Workspace cancel preserves the active workspace
- GIVEN a dirty workspace switch is awaiting a decision
- WHEN cancel is selected
- THEN the current workspace and dirty state remain active
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-07`; `src/main/recovery/RecoveryGate.test.ts#WR-07`; `tests-e2e/app.spec.ts#workspace-recovery/workspace-cancel`

#### Scenario: Workspace save failure blocks switching
- GIVEN one workspace buffer fails to save
- WHEN save is selected
- THEN the current workspace remains active and dirty
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-08`; `src/main/recovery/RecoveryGate.test.ts#WR-08`; `tests-e2e/app.spec.ts#workspace-recovery/workspace-save-failure`

#### Scenario: Window save succeeds for all buffers
- GIVEN a window close contains all dirty buffers across its tabs
- WHEN every save succeeds
- THEN the window closes after every acknowledgement
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-09`; `src/main/recovery/RecoveryGate.test.ts#WR-09`; `tests-e2e/app.spec.ts#workspace-recovery/window-save-all`

#### Scenario: Window discard succeeds for all buffers
- GIVEN a window close contains all dirty buffers across its tabs
- WHEN every recovery deletion succeeds
- THEN the window closes
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-10`; `src/main/recovery/RecoveryGate.test.ts#WR-10`; `tests-e2e/app.spec.ts#workspace-recovery/window-discard-all`

#### Scenario: Window cancel preserves the window
- GIVEN a dirty window close is awaiting a decision
- WHEN cancel is selected
- THEN the window remains open and dirty
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-11`; `src/main/recovery/RecoveryGate.test.ts#WR-11`; `tests-e2e/app.spec.ts#workspace-recovery/window-cancel`

#### Scenario: Window save failure blocks closing
- GIVEN one window buffer fails to save
- WHEN save is selected
- THEN the window remains open and dirty
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-12`; `src/main/recovery/RecoveryGate.test.ts#WR-12`; `tests-e2e/app.spec.ts#workspace-recovery/window-save-failure`

#### Scenario: Updater save succeeds for all buffers
- GIVEN updater installation contains all dirty buffers
- WHEN every save succeeds
- THEN installation starts after every acknowledgement
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-13`; `src/main/recovery/RecoveryGate.test.ts#WR-13`; `tests-e2e/app.spec.ts#workspace-recovery/updater-save-all`

#### Scenario: Updater discard succeeds for all buffers
- GIVEN updater installation contains all dirty buffers
- WHEN every recovery deletion succeeds
- THEN installation starts
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-14`; `src/main/recovery/RecoveryGate.test.ts#WR-14`; `tests-e2e/app.spec.ts#workspace-recovery/updater-discard-all`

#### Scenario: Updater cancel prevents installation
- GIVEN a dirty updater installation is awaiting a decision
- WHEN cancel is selected
- THEN installation does not start and dirty state is unchanged
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-15`; `src/main/recovery/RecoveryGate.test.ts#WR-15`; `tests-e2e/app.spec.ts#workspace-recovery/updater-cancel`

#### Scenario: Updater save failure prevents installation
- GIVEN one updater buffer fails to save
- WHEN save is selected
- THEN installation does not start and the buffer remains dirty
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-16`; `src/main/recovery/RecoveryGate.test.ts#WR-16`; `tests-e2e/app.spec.ts#workspace-recovery/updater-save-failure`

#### Scenario: Close approval rejects a sender mismatch
- GIVEN an approval issued to sender A
- WHEN sender B retries the close
- THEN re-entry is denied
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-17`; `src/main/recovery/RecoveryGate.test.ts#WR-17`; `tests-e2e/app.spec.ts#workspace-recovery/approval-sender`

#### Scenario: Close approval rejects an epoch mismatch
- GIVEN an approval issued at epoch 4
- WHEN close retries at epoch 5
- THEN re-entry is denied
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-18`; `src/main/recovery/RecoveryGate.test.ts#WR-18`; `tests-e2e/app.spec.ts#workspace-recovery/approval-epoch`

#### Scenario: Close approval rejects a transition mismatch
- GIVEN an approval issued for a window close
- WHEN an updater install retries it
- THEN re-entry is denied
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-19`; `src/main/recovery/RecoveryGate.test.ts#WR-19`; `tests-e2e/app.spec.ts#workspace-recovery/approval-transition`

#### Scenario: Close approval rejects a dirty-set revision mismatch
- GIVEN an approval for dirty-set revision 7
- WHEN a new dirty buffer changes the revision to 8
- THEN re-entry is denied
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-20`; `src/main/recovery/RecoveryGate.test.ts#WR-20`; `tests-e2e/app.spec.ts#workspace-recovery/approval-dirty-revision`

#### Scenario: Close approval is one-shot
- GIVEN a valid approval is consumed once
- WHEN the same close is retried again
- THEN a new gate is required
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-21`; `src/main/recovery/RecoveryGate.test.ts#WR-21`; `tests-e2e/app.spec.ts#workspace-recovery/approval-one-shot`

### Requirement: Maintain and restore the exact encrypted journal

Each v1 record MUST contain `{workspaceId,fileId,revision,baseHash,ciphertext,createdAt,ackedAt?}` and be encrypted, integrity-checked, and atomically published. Client revisions MUST be strictly increasing per file. Limits are exactly 2 MiB UTF-8 per file, 20 MiB stored per workspace, 100 revisions total, 10 newest revisions per file, and seven days. Pruning order is: (1) expired acknowledged records, (2) other acknowledged records, (3) expired unacknowledged records only when another unacknowledged revision for that file remains, (4) superseded unacknowledged records. Each bucket is ordered by `createdAt`, then `revision`, then `fileId`. The newest unacknowledged revision per dirty file MUST NOT be evicted. If no removable record remains, append MUST be atomically rejected with `recovery_capacity_exceeded`, leaving the buffer dirty and destructive transitions blocked.

#### Scenario: File-size quota rejects atomically
- GIVEN a snapshot is larger than 2 MiB UTF-8
- WHEN it is appended
- THEN no record or manifest change occurs and `recovery_capacity_exceeded` is returned
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-22`; `src/main/recovery/RecoveryStore.test.ts#WR-22`; `tests-e2e/app.spec.ts#workspace-recovery/file-quota`

#### Scenario: Workspace quota prunes expired acknowledged records first
- GIVEN the workspace exceeds 20 MiB and has an expired acknowledged record
- WHEN pruning runs
- THEN that record is removed before any non-expired record
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-23`; `src/main/recovery/RecoveryStore.test.ts#WR-23`; `tests-e2e/app.spec.ts#workspace-recovery/prune-expired-acknowledged`

#### Scenario: Expired unacknowledged records preserve the sole revision
- GIVEN an expired unacknowledged record is the only revision for its dirty file
- WHEN pruning runs
- THEN the record is retained and the next append is atomically rejected
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-24`; `src/main/recovery/RecoveryStore.test.ts#WR-24`; `tests-e2e/app.spec.ts#workspace-recovery/protect-sole-unacknowledged`

#### Scenario: Superseded unacknowledged records prune after acknowledged records
- GIVEN capacity remains exceeded after acknowledged pruning and an older unacknowledged revision is superseded
- WHEN pruning runs
- THEN the superseded revision is removed while the newest unacknowledged revision remains
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-25`; `src/main/recovery/RecoveryStore.test.ts#WR-25`; `tests-e2e/app.spec.ts#workspace-recovery/prune-superseded`

#### Scenario: Corrupt record is quarantined
- GIVEN one journal record fails envelope or ciphertext validation
- WHEN restore scans it
- THEN the record is quarantined and is not offered
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-26`; `src/main/recovery/RecoveryStore.test.ts#WR-26`; `tests-e2e/app.spec.ts#workspace-recovery/quarantine-record`

#### Scenario: Quarantine failure blocks unsafe restore
- GIVEN a corrupt record cannot be quarantined
- WHEN restore scans it
- THEN restore returns `recovery_corrupt` and does not apply that record
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-27`; `src/main/recovery/RecoveryStore.test.ts#WR-27`; `tests-e2e/app.spec.ts#workspace-recovery/quarantine-failure`

#### Scenario: Invalid manifest is quarantined
- GIVEN the recovery manifest has an invalid version or workspace binding
- WHEN restore starts
- THEN the manifest is quarantined and no record is offered
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-28`; `src/main/recovery/RecoveryStore.test.ts#WR-28`; `tests-e2e/app.spec.ts#workspace-recovery/quarantine-manifest`

#### Scenario: Restore warning identifies fallback
- GIVEN the newest record is corrupt and an older record is valid
- WHEN restore selects a record
- THEN the older record is offered with a fallback warning
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-29`; `src/main/recovery/RecoveryStore.test.ts#WR-29`; `tests-e2e/app.spec.ts#workspace-recovery/restore-warning`

#### Scenario: Warning publication failure preserves recovery
- GIVEN a valid fallback exists but its warning cannot be published
- WHEN restore is attempted
- THEN the record remains unacknowledged and the buffer is not silently replaced
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-30`; `src/main/recovery/RecoveryStore.test.ts#WR-30`; `tests-e2e/app.spec.ts#workspace-recovery/warning-failure`

#### Scenario: Restore acknowledgement follows buffer success
- GIVEN a valid recovery record is selected
- WHEN buffer installation succeeds and acknowledgement succeeds
- THEN the record becomes acknowledged
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-31`; `src/main/recovery/RecoveryStore.test.ts#WR-31`; `tests-e2e/app.spec.ts#workspace-recovery/restore-acknowledgement`

#### Scenario: Restore failure leaves the record available
- GIVEN buffer installation fails for a valid recovery record
- WHEN restore is attempted
- THEN the record remains unacknowledged and available for retry
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-32`; `src/main/recovery/RecoveryStore.test.ts#WR-32`; `tests-e2e/app.spec.ts#workspace-recovery/restore-failure`

#### Scenario: Crash preserves unacknowledged recovery
- GIVEN the process crashes before a transition decision completes
- WHEN the workspace reopens
- THEN the latest valid unacknowledged record is offered
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-33`; `src/main/recovery/RecoveryStore.test.ts#WR-33`; `tests-e2e/app.spec.ts#workspace-recovery/crash-preservation`

#### Scenario: Recovery decision UI is accessible
- GIVEN a transition is blocked on a decision
- WHEN keyboard or assistive technology reaches the gate
- THEN focus, labels, state, failure text, and non-timeout choices are exposed
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-34`; `src/main/recovery/RecoveryGate.test.ts#WR-34`; `tests-e2e/app.spec.ts#workspace-recovery/accessible-decision`

#### Scenario: Recovery manifest publication failure is atomic
- GIVEN a valid snapshot whose manifest publication fails
- WHEN the snapshot is appended
- THEN `os_failure` is returned and the prior record set remains unchanged
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-35`; `src/main/recovery/RecoveryStore.test.ts#WR-35`; `tests-e2e/app.spec.ts#workspace-recovery/manifest-publication-failure`

#### Scenario: Non-monotonic recovery revision is rejected
- GIVEN the last accepted client revision for a file is 8
- WHEN revision 8 is appended again
- THEN it returns `malformed_request` and the accepted record remains unchanged
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WR-36`; `src/main/recovery/RecoveryStore.test.ts#WR-36`; `tests-e2e/app.spec.ts#workspace-recovery/non-monotonic-revision`
