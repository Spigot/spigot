# Proposal: Secure Workspace Recovery

## Intent

Make authority—not renderer paths—the source of truth, prevent loss, and remove renderer plaintext credentials. This supersedes **only** `harden-ide-foundations`' safety/recovery slice.

## Scope

### In Scope
- Authority tuple `{workspaceId, webContentsId, epoch, operation, target}` with exact/subtree grants; revoke on switch/close, renderer navigation/destruction, or shutdown; recheck before side effects.
- Migrate categories: workspace/filesystem; agent file/Git tools; Git/GitHub; terminal cwd/SSH identity; LSP; external paths/URLs and workspace-keyed stores; secrets/providers; destructive transitions.
- Save/discard/cancel and encrypted recovery for tab, workspace, app, updater exits.

### Out of Scope
- Terminal attach, addressed chat turns, managed services, visual redesign, unrelated `AIPanel.tsx` edits.
- Unrestricted agent shell execution; deny `run_command` unless a future capability separately authorizes it.

## Capabilities

### New Capabilities
- `workspace-authority`: Grants, boundaries, containment, errors.
- `workspace-recovery`: Transitions and encrypted journals.
- `credential-vault`: References and migration.

### Modified Capabilities
- None.

## Approach

Use single-owner authority, recovery, and vault services; never parallel owners.

Windows allows absolute local-drive paths only; rejects drive/root-relative, UNC, device/extended/NT-device, and ADS forms. Canonicalize target or nearest existing ancestor, compare root boundaries, and revalidate handle/parent identity across reparse races.

Error precedence: malformed → unknown/revoked workspace/grant → owner/epoch mismatch → unsupported operation → unsupported Windows form → target/grant/protected-target denial → containment/reparse `path_race` → OS failure. Earlier errors cannot probe existence; redact details.

Recovery limits: 20 MiB/workspace, 2 MiB/file, 100 revisions, newest 10/file, seven days. Prune acknowledged first; never evict the sole unacknowledged revision. Protected-only overflow returns `recovery_capacity_exceeded`, remains dirty, and blocks destruction until save/discard. Restore validates envelope/version/workspace/file/ciphertext, quarantines corruption, uses newest valid revision with warning, or restores nothing. Save acknowledges after disk success; discard deletes recovery; cancel changes nothing; crashes preserve records.

Credential migration locks each entry; validates, `safeStorage`-encrypts, atomically publishes, decrypt-verifies, and records it. Legacy stays authoritative until all verify and cutover removes `apiKeys`. Partial failure removes failed temporary data only. Pre-cutover rollback keeps legacy; post-cutover uses verified ciphertext, never plaintext. Renderer gets references/status; unavailable secure storage returns a typed block.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/main/**`, preload | Modified/New | Owners/contracts/adapters |
| renderer/tests | Modified/New | Projections/evidence |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Reparse/migration races | High | Fixtures, locks, atomic cutovers, fail-closed adapters |

## Rollback Plan

Revert adapters by slice. Before vault cutover use legacy data; afterward retain the verified encrypted reader. Never restore plaintext or bypass gates.

## Dependencies

- `safeStorage`, Windows reparse seam, auto-chained delivery within 4,000 lines.

## Success Criteria

- [ ] Every category enforces authority and deterministic Windows/error policy.
- [ ] Transitions/recovery satisfy quota, overflow, corruption, and decision rules.
- [ ] Renderer receives no plaintext; migration/rollback are atomic and retryable.
