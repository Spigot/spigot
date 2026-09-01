# workspace-authority Specification

## Purpose and boundary

This child supersedes and withdraws **only** the normative `ide-safety-recovery` slice of `harden-ide-foundations`; it does not alter the parent artifacts or the parent terminal, conversation, or managed-service slices. It depends on the parent's shared IPC-contract boundary, but defines this child's authoritative security behavior. Protected targets are `.env`/`.env.*`, credential/secret files (`credentials*`, `secrets*`, `*.secret`, `*.secrets`), private-key files (`id_rsa`, `id_ed25519`, `id_ecdsa`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.ppk`), and the recovery/vault internal stores. Protected-target content access MUST retain denial behavior and return no contents; an explicit `ssh.identity` grant MAY consume a key opaquely without exposing its bytes.

## Requirements

### Requirement: Issue least-privilege grants

The main authority MUST bind every grant to `{workspaceId, webContentsId, epoch, operation, target, scope}`. `scope` MUST be `exact` or `subtree`; a grant MUST authorize only its named operation and target. Positive cases are defined below; a target outside the row is denied.

| Operation | Exact positive target | Subtree positive target |
|---|---|---|
| `fs.read` | one authorized file | one authorized subtree |
| `fs.write` | one authorized file | one authorized subtree |
| `fs.create` | one authorized directory/item | one authorized subtree |
| `fs.delete` | one authorized file | one authorized subtree |
| `fs.list` | one authorized directory/item | one authorized subtree |
| `fs.watch` | not applicable | one authorized subtree |
| `agent.file.read` | same file grant | same subtree grant |
| `agent.file.write` | same file grant | same subtree grant |
| `agent.git.read` | authorized repository/submodule | declared repository subtree |
| `git.read` | repository root | declared submodule root |
| `git.index` | repository root | no broader scope |
| `git.commit` | repository root | no broader scope |
| `git.network` | repository root plus network grant | no broader scope |
| `github.pr` | repository root plus network grant | no broader scope |
| `lsp.open` | authorized document | no broader scope |
| `lsp.change` | authorized document | no broader scope |
| `lsp.save` | authorized document | no broader scope |
| `lsp.completion` | authorized document | no broader scope |
| `terminal.cwd` | authorized directory | authorized subtree |
| `ssh.identity` | explicitly granted external key | no subtree grant |
| `external.shell` | explicitly granted path | no subtree grant |
| `external.url` | approved scheme/host | no path scope |
| `store.workspace` | workspace identity | no subtree grant |
| `provider.call` | matching credential reference plus network grant | no subtree grant |
| `recovery.save` | gate-bound dirty set | no renderer-selected expansion |
| `recovery.discard` | gate-bound dirty set | no renderer-selected expansion |

#### Scenario: Exact file read succeeds
- GIVEN an active workspace and an exact `fs.read` grant for `notes.txt`
- WHEN the owner reads `notes.txt`
- THEN the read succeeds and no sibling is authorized
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-01`; `src/main/security/WorkspaceAuthority.test.ts#WA-01`; `tests-e2e/app.spec.ts#workspace-authority/exact-file-read`

#### Scenario: Subtree list succeeds
- GIVEN a subtree `fs.list` grant for `src`
- WHEN the owner lists a descendant directory
- THEN the listing succeeds within `src`
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-02`; `src/main/security/WorkspaceAuthority.test.ts#WA-02`; `tests-e2e/app.spec.ts#workspace-authority/subtree-list`

#### Scenario: Watch is subtree-scoped
- GIVEN a subtree `fs.watch` grant for `src`
- WHEN a descendant changes
- THEN the owner receives the watch event and no event outside `src`
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-03`; `src/main/security/WorkspaceAuthority.test.ts#WA-03`; `tests-e2e/app.spec.ts#workspace-authority/subtree-watch`

#### Scenario: Git read succeeds alone
- GIVEN an exact `git.read` grant for a repository root
- WHEN status or diff is requested
- THEN the read succeeds without index, commit, network, or PR authority
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-04`; `src/main/security/WorkspaceAuthority.test.ts#WA-04`; `tests-e2e/app.spec.ts#workspace-authority/git-read`

#### Scenario: Git index succeeds alone
- GIVEN an exact `git.index` grant for a repository root
- WHEN stage or unstage is requested
- THEN the index operation succeeds without commit or network authority
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-05`; `src/main/security/WorkspaceAuthority.test.ts#WA-05`; `tests-e2e/app.spec.ts#workspace-authority/git-index`

#### Scenario: Git commit succeeds alone
- GIVEN an exact `git.commit` grant for a repository root
- WHEN a commit is requested
- THEN the commit operation succeeds without network authority
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-06`; `src/main/security/WorkspaceAuthority.test.ts#WA-06`; `tests-e2e/app.spec.ts#workspace-authority/git-commit`

#### Scenario: Git network requires composition
- GIVEN an exact `git.network` grant and a separate network grant
- WHEN a push is requested
- THEN the push succeeds only while both grants are valid
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-07`; `src/main/security/WorkspaceAuthority.test.ts#WA-07`; `tests-e2e/app.spec.ts#workspace-authority/git-network`

#### Scenario: GitHub PR requires composition
- GIVEN an exact `github.pr` grant and a separate network grant
- WHEN a pull request is requested
- THEN the PR operation succeeds only while both grants are valid
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-08`; `src/main/security/WorkspaceAuthority.test.ts#WA-08`; `tests-e2e/app.spec.ts#workspace-authority/github-pr`

#### Scenario: LSP open is document-scoped
- GIVEN an exact `lsp.open` grant for one document
- WHEN that document is opened
- THEN opening succeeds
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-09`; `src/main/security/WorkspaceAuthority.test.ts#WA-09`; `tests-e2e/app.spec.ts#workspace-authority/lsp-open`

#### Scenario: LSP change is document-scoped
- GIVEN an exact `lsp.change` grant for one document
- WHEN that document changes
- THEN changing succeeds without save authority
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-10`; `src/main/security/WorkspaceAuthority.test.ts#WA-10`; `tests-e2e/app.spec.ts#workspace-authority/lsp-change`

#### Scenario: LSP save is document-scoped
- GIVEN an exact `lsp.save` grant for one document
- WHEN that document is saved
- THEN saving succeeds
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-11`; `src/main/security/WorkspaceAuthority.test.ts#WA-11`; `tests-e2e/app.spec.ts#workspace-authority/lsp-save`

#### Scenario: LSP completion is document-scoped
- GIVEN an exact `lsp.completion` grant for one document
- WHEN completion is requested
- THEN completion succeeds without write authority
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-12`; `src/main/security/WorkspaceAuthority.test.ts#WA-12`; `tests-e2e/app.spec.ts#workspace-authority/lsp-completion`

#### Scenario: Agent file read reuses authority
- GIVEN an agent file-read request with an authorized file grant
- WHEN the agent reads the file
- THEN the read succeeds without a second path authority
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-13`; `src/main/security/privilegedInventory.test.ts#WA-13`; `tests-e2e/app.spec.ts#workspace-authority/agent-file-read`

#### Scenario: Agent file write reuses authority
- GIVEN an agent file-write request with an authorized subtree grant
- WHEN the agent writes a descendant
- THEN the write succeeds without a second path authority
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-14`; `src/main/security/privilegedInventory.test.ts#WA-14`; `tests-e2e/app.spec.ts#workspace-authority/agent-file-write`

#### Scenario: Agent Git reuses repository authority
- GIVEN an agent Git request with an authorized repository grant
- WHEN the agent reads repository state
- THEN the request succeeds without a second repository authority
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-15`; `src/main/security/privilegedInventory.test.ts#WA-15`; `tests-e2e/app.spec.ts#workspace-authority/agent-git`

#### Scenario: Terminal cwd is directory-scoped
- GIVEN an exact `terminal.cwd` grant for an in-workspace directory
- WHEN a local terminal starts there
- THEN the cwd is accepted
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-16`; `src/main/security/WorkspaceAuthority.test.ts#WA-16`; `tests-e2e/app.spec.ts#workspace-authority/terminal-cwd`

#### Scenario: SSH identity requires an explicit file grant
- GIVEN an exact `ssh.identity` grant for an external private-key file
- WHEN an SSH terminal uses it
- THEN the identity is accepted without granting its parent subtree
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-17`; `src/main/security/WorkspaceAuthority.test.ts#WA-17`; `tests-e2e/app.spec.ts#workspace-authority/ssh-identity`

#### Scenario: Approved URL policy succeeds
- GIVEN an `https` URL whose host is on the main-owned allowlist
- WHEN external navigation is requested
- THEN navigation succeeds
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-18`; `src/main/security/WorkspaceAuthority.test.ts#WA-18`; `tests-e2e/app.spec.ts#workspace-authority/approved-url`

#### Scenario: Provider reference is bound
- GIVEN a credential reference bound to provider `p`
- WHEN provider `p` is called with an authorized network grant
- THEN the call succeeds without exposing the secret
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-19`; `src/main/security/WorkspaceAuthority.test.ts#WA-19`; `tests-e2e/app.spec.ts#workspace-authority/provider-binding`

#### Scenario: Recovery decisions cannot expand their dirty set
- GIVEN a gate grant containing a fixed dirty-buffer set
- WHEN a renderer submits save or discard for an unlisted buffer
- THEN the request is denied with no state change
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-20`; `src/main/security/WorkspaceAuthority.test.ts#WA-20`; `tests-e2e/app.spec.ts#workspace-authority/recovery-grant`

#### Scenario: Exact file write succeeds
- GIVEN an exact `fs.write` grant for `notes.txt`
- WHEN the owner writes `notes.txt`
- THEN the write succeeds
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-33`; `src/main/security/WorkspaceAuthority.test.ts#WA-33`; `tests-e2e/app.spec.ts#workspace-authority/exact-file-write`

#### Scenario: Exact directory create succeeds
- GIVEN an exact `fs.create` grant for directory `src`
- WHEN the owner creates one child in `src`
- THEN creation succeeds
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-34`; `src/main/security/WorkspaceAuthority.test.ts#WA-34`; `tests-e2e/app.spec.ts#workspace-authority/exact-create`

#### Scenario: Exact file delete succeeds
- GIVEN an exact `fs.delete` grant for `obsolete.txt`
- WHEN the owner deletes `obsolete.txt`
- THEN deletion succeeds
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-35`; `src/main/security/WorkspaceAuthority.test.ts#WA-35`; `tests-e2e/app.spec.ts#workspace-authority/exact-delete`

#### Scenario: Subtree write succeeds
- GIVEN a subtree `fs.write` grant for `src`
- WHEN the owner writes a descendant
- THEN the write succeeds within `src`
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-36`; `src/main/security/WorkspaceAuthority.test.ts#WA-36`; `tests-e2e/app.spec.ts#workspace-authority/subtree-write`

#### Scenario: Workspace store access is identity-bound
- GIVEN an active workspace identity and a `store.workspace` grant
- WHEN a workspace-keyed record is read
- THEN only that workspace's record is returned
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-37`; `src/main/security/WorkspaceAuthority.test.ts#WA-37`; `tests-e2e/app.spec.ts#workspace-authority/workspace-store`

### Requirement: Contain Windows targets and protected data

Only absolute local-drive paths are valid. The policy MUST normalize separators, dot segments, and drive case, compare root equality or `root + separator`, validate the nearest existing ancestor for missing targets, and reject reparse escape. It MUST reject drive-relative, root-relative, UNC, extended, Win32-device, NT-device, and ADS forms. `external.url` MUST allow only `https` with a main-owned approved host; every other scheme or host MUST return `target_denied`. Protected targets MUST return `target_denied` for read, list, write, create, delete, search, Git, LSP, and agent access.

#### Scenario: Drive-relative path is denied
- GIVEN the target `C:notes.txt`
- WHEN containment is evaluated
- THEN it returns `unsupported_path_form` without probing the target
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-21`; `src/main/security/PathPolicy.test.ts#WA-21`; `tests-e2e/app.spec.ts#workspace-authority/drive-relative`

#### Scenario: UNC path is denied
- GIVEN the target `\\server\share\x`
- WHEN containment is evaluated
- THEN it returns `unsupported_path_form` without probing the target
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-22`; `src/main/security/PathPolicy.test.ts#WA-22`; `tests-e2e/app.spec.ts#workspace-authority/unc-path`

#### Scenario: Extended path is denied
- GIVEN the target `\\?\C:\x`
- WHEN containment is evaluated
- THEN it returns `unsupported_path_form` without probing the target
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-23`; `src/main/security/PathPolicy.test.ts#WA-23`; `tests-e2e/app.spec.ts#workspace-authority/extended-path`

#### Scenario: NT-device path is denied
- GIVEN the target `\Device\HarddiskVolume1\x`
- WHEN containment is evaluated
- THEN it returns `unsupported_path_form` without probing the target
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-24`; `src/main/security/PathPolicy.test.ts#WA-24`; `tests-e2e/app.spec.ts#workspace-authority/nt-device`

#### Scenario: ADS path is denied
- GIVEN the target `notes.txt:stream`
- WHEN containment is evaluated
- THEN it returns `unsupported_path_form` without probing the target
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-25`; `src/main/security/PathPolicy.test.ts#WA-25`; `tests-e2e/app.spec.ts#workspace-authority/ads-path`

#### Scenario: Reparse replacement is denied
- GIVEN an authorized target whose parent identity changes before the effect
- WHEN the effect is committed
- THEN it returns `path_race` and performs no effect
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-26`; `src/main/security/PathPolicy.test.ts#WA-26`; `tests-e2e/app.spec.ts#workspace-authority/reparse-race`

#### Scenario: Protected environment file is denied
- GIVEN a request for `.env`
- WHEN any privileged content operation is requested
- THEN it returns `target_denied` with redacted details
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-27`; `src/main/security/PathPolicy.test.ts#WA-27`; `tests-e2e/app.spec.ts#workspace-authority/protected-env`

#### Scenario: Protected private key is denied
- GIVEN a request for `id_ed25519`
- WHEN any privileged content operation is requested
- THEN it returns `target_denied` and no key bytes cross a boundary
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-28`; `src/main/security/PathPolicy.test.ts#WA-28`; `tests-e2e/app.spec.ts#workspace-authority/protected-private-key`

#### Scenario: Recovery and vault internals are denied
- GIVEN a request targeting either internal store
- WHEN a renderer or agent requests filesystem access
- THEN it returns `target_denied` and the store remains unchanged
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-29`; `src/main/security/PathPolicy.test.ts#WA-29`; `tests-e2e/app.spec.ts#workspace-authority/protected-internals`

### Requirement: Use one public error contract and revocation rule

Public errors MUST be exactly: `malformed_request` (invalid shape), `workspace_or_grant_revoked` (unknown/revoked reference), `owner_epoch_mismatch` (sender or epoch differs), `unsupported_operation` (operation not granted, including unrestricted `run_command`), `unsupported_path_form` (rejected Windows syntax), `target_denied` (scope, protected target, URL, provider, or network-policy denial), `path_race` (identity/reparse race), `os_failure` (authorized platform failure), `recovery_capacity_exceeded` (no removable journal capacity), `recovery_corrupt` (no trustworthy recovery envelope), `secure_storage_unavailable` (secure storage cannot decrypt/encrypt), and `migration_failed` (retryable vault transaction failure). Common precedence is exactly the first eight codes in the order listed; specialized codes are reachable only after common authorization succeeds. Errors MUST redact paths, secrets, and OS text. Revocation MUST increment epoch and invalidate grants on switch, close, navigation, destruction, shutdown, and lifecycle transfer; commit rechecks MUST observe revocation.

#### Scenario: Sender revocation wins before commit
- GIVEN a valid grant and an in-flight operation
- WHEN the renderer is destroyed before commit
- THEN the operation returns `workspace_or_grant_revoked` with no side effect
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-30`; `src/main/security/WorkspaceAuthority.test.ts#WA-30`; `tests-e2e/app.spec.ts#workspace-authority/revocation`

#### Scenario: Error precedence is deterministic
- GIVEN one request that is malformed and also names an invalid path
- WHEN authorization evaluates it
- THEN it returns only `malformed_request`
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-31`; `src/main/security/WorkspaceAuthority.test.ts#WA-31`; `tests-e2e/app.spec.ts#workspace-authority/error-precedence`

#### Scenario: Unrestricted agent command is denied
- GIVEN an agent requests `run_command`
- WHEN the operation is evaluated
- THEN it returns `unsupported_operation` and starts no process
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-32`; `src/main/security/privilegedInventory.test.ts#WA-32`; `tests-e2e/app.spec.ts#workspace-authority/unrestricted-command`

#### Scenario: Non-HTTPS URL is denied
- GIVEN an `http` URL whose host is approved
- WHEN external navigation is requested
- THEN it returns `target_denied` without navigation
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-38`; `src/main/security/WorkspaceAuthority.test.ts#WA-38`; `tests-e2e/app.spec.ts#workspace-authority/non-https-url`

#### Scenario: Revoked network grant stops a push
- GIVEN a valid `git.network` grant and network grant
- WHEN the network grant is revoked before push commit
- THEN push returns `workspace_or_grant_revoked` without network activity
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#WA-39`; `src/main/security/WorkspaceAuthority.test.ts#WA-39`; `tests-e2e/app.spec.ts#workspace-authority/network-revocation`
