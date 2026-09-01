# credential-vault Specification

## Purpose and boundary

This child supersedes and withdraws only the credential-migration/secret-protection slice of the parent's `ide-safety-recovery` capability. It does not edit or broaden parent artifacts. It depends on the parent's shared IPC contract and `workspace-authority`; vault internals are protected targets. Renderer projections contain references and status only, never credential plaintext.

## Requirements

### Requirement: Bind provider references and secure storage

The vault MUST expose only `{credentialRef, provider, configured}` and migration status. `provider.call` MUST require a matching provider-bound reference and an authorized network grant; the main process alone may resolve the secret. `safeStorage` failure MUST use the single public code `secure_storage_unavailable`, preserve encrypted data, and never expose plaintext. Other authorized transactional failures MUST use `migration_failed`.

#### Scenario: Provider reference matches
- GIVEN a credential reference bound to provider `openai`
- WHEN an authorized `openai` call resolves it
- THEN the provider receives the secret and the renderer receives no secret
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-01`; `src/main/vault/SecretVault.test.ts#CV-01`; `tests-e2e/app.spec.ts#credential-vault/provider-binding`

#### Scenario: Provider reference mismatch is denied
- GIVEN a credential reference bound to provider `openai`
- WHEN a `github` call presents it
- THEN the call returns `target_denied` without network activity
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-02`; `src/main/vault/SecretVault.test.ts#CV-02`; `tests-e2e/app.spec.ts#credential-vault/provider-mismatch`

#### Scenario: Secure storage unavailability is typed
- GIVEN secure storage cannot encrypt or decrypt
- WHEN migration or credential resolution is requested
- THEN it returns `secure_storage_unavailable` without changing or revealing credentials
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-03`; `src/main/vault/SecretVault.test.ts#CV-03`; `tests-e2e/app.spec.ts#credential-vault/secure-storage-unavailable`

#### Scenario: Renderer projection contains no plaintext
- GIVEN a configured credential
- WHEN status, settings, or provider execution crosses the renderer boundary
- THEN only the opaque reference, provider, configured flag, and status cross it
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-04`; `src/main/vault/SecretVault.test.ts#CV-04`; `tests-e2e/app.spec.ts#credential-vault/no-plaintext`

### Requirement: Migrate entries transactionally and retryably

Migration MUST validate each legacy entry, lock it, publish encrypted data atomically, decrypt-verify it, and record its state. The legacy `apiKeys` owner MUST remain authoritative until every entry verifies and cutover completes. A current lock returns retryable `migration_failed` without mutation. An expired lock MAY be reclaimed once; failed temporary data MUST be removed without changing other entries. Retries MUST process only unresolved entries.

#### Scenario: Concurrent migration is rejected
- GIVEN one migration holds the live vault lock
- WHEN another migration starts
- THEN it returns retryable `migration_failed` without mutation
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-05`; `src/main/vault/SecretVault.test.ts#CV-05`; `tests-e2e/app.spec.ts#credential-vault/concurrent-migration`

#### Scenario: Stale lock is reclaimed
- GIVEN the vault lock lease is expired and its owner is absent
- WHEN migration starts
- THEN the stale lock is reclaimed and migration proceeds
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-06`; `src/main/vault/SecretVault.test.ts#CV-06`; `tests-e2e/app.spec.ts#credential-vault/stale-lock`

#### Scenario: Staged entry survives a partial migration safely
- GIVEN entry `a` is staged and entry `b` fails validation
- WHEN migration ends
- THEN legacy remains authoritative and only `b` temporary data is removed
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-07`; `src/main/vault/SecretVault.test.ts#CV-07`; `tests-e2e/app.spec.ts#credential-vault/partial-entry-failure`

#### Scenario: Temporary cleanup failure blocks cutover
- GIVEN a failed entry temporary record cannot be removed
- WHEN migration handles the failure
- THEN it returns `migration_failed`, keeps legacy authoritative, and does not cut over
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-08`; `src/main/vault/SecretVault.test.ts#CV-08`; `tests-e2e/app.spec.ts#credential-vault/temp-cleanup-failure`

#### Scenario: Retry processes only unresolved entries
- GIVEN verified entry `a` and failed entry `b` remain
- WHEN migration is retried
- THEN only `b` is processed and `a` remains verified and unchanged
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-09`; `src/main/vault/SecretVault.test.ts#CV-09`; `tests-e2e/app.spec.ts#credential-vault/per-entry-retry`

### Requirement: Make crash recovery deterministic across vault states

The durable state order is `intent`, `staged_entry`, `verified_entry`, `cutover_manifest`, `plaintext_removal`, `activation`. Startup MUST apply these rules: intent or staged entry with plaintext present keeps legacy authoritative and removes only safe temporary state; verified entries remain available but non-authoritative; a cutover manifest with plaintext present does not activate; plaintext removed with a complete verified manifest activates encrypted-only; activation remains encrypted-only. Any inconsistency returns `migration_failed` and never recreates plaintext.

#### Scenario: Intent crash keeps legacy authoritative
- GIVEN an intent marker and legacy `apiKeys` are present
- WHEN startup resumes
- THEN legacy remains authoritative and no plaintext is copied into vault output
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-10`; `src/main/vault/SecretVault.test.ts#CV-10`; `tests-e2e/app.spec.ts#credential-vault/crash-intent`

#### Scenario: Staged-entry crash removes only staging
- GIVEN a staged entry and legacy `apiKeys` are present
- WHEN startup resumes
- THEN the staged temporary entry is removed and legacy remains authoritative
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-11`; `src/main/vault/SecretVault.test.ts#CV-11`; `tests-e2e/app.spec.ts#credential-vault/crash-staged`

#### Scenario: Verified-entry crash preserves verified data
- GIVEN a verified entry exists before cutover
- WHEN startup resumes
- THEN the verified entry is retained but legacy remains authoritative
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-12`; `src/main/vault/SecretVault.test.ts#CV-12`; `tests-e2e/app.spec.ts#credential-vault/crash-verified`

#### Scenario: Cutover-manifest crash does not activate early
- GIVEN a cutover manifest exists while `apiKeys` is still present
- WHEN startup resumes
- THEN the encrypted reader is not activated and legacy remains authoritative
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-13`; `src/main/vault/SecretVault.test.ts#CV-13`; `tests-e2e/app.spec.ts#credential-vault/crash-manifest`

#### Scenario: Plaintext-removal crash activates only complete ciphertext
- GIVEN `apiKeys` is absent and every manifest entry is verified
- WHEN startup resumes
- THEN the encrypted reader activates and no plaintext reader is restored
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-14`; `src/main/vault/SecretVault.test.ts#CV-14`; `tests-e2e/app.spec.ts#credential-vault/crash-plaintext-removal`

#### Scenario: Activation crash remains encrypted-only
- GIVEN activation state exists without legacy plaintext
- WHEN startup resumes
- THEN the encrypted reader remains authoritative
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-15`; `src/main/vault/SecretVault.test.ts#CV-15`; `tests-e2e/app.spec.ts#credential-vault/crash-activation`

### Requirement: Cut over and roll back without plaintext restoration

Cutover MUST publish one complete verified manifest, remove `apiKeys`, and activate the encrypted reader as one durable transition. Before cutover, rollback MUST retain legacy authority and may retain verified ciphertext. After cutover, rollback MUST use verified ciphertext only. Neither path may recreate plaintext. Every renderer or provider failure MUST leave the last safe owner active.

#### Scenario: Complete migration retires plaintext
- GIVEN every entry is decrypt-verified
- WHEN cutover succeeds
- THEN the encrypted manifest is authoritative and `apiKeys` is absent
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-16`; `src/main/vault/SecretVault.test.ts#CV-16`; `tests-e2e/app.spec.ts#credential-vault/cutover`

#### Scenario: Pre-cutover rollback keeps legacy
- GIVEN migration fails before plaintext removal
- WHEN rollback is selected
- THEN legacy remains authoritative and no plaintext is newly written
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-17`; `src/main/vault/SecretVault.test.ts#CV-17`; `tests-e2e/app.spec.ts#credential-vault/pre-cutover-rollback`

#### Scenario: Post-cutover rollback stays encrypted-only
- GIVEN migration has removed `apiKeys` and activated the vault
- WHEN rollback is selected
- THEN verified ciphertext remains authoritative and plaintext is not restored
- Evidence: `tests/contracts/secure-workspace-recovery.contract.test.ts#CV-18`; `src/main/vault/SecretVault.test.ts#CV-18`; `tests-e2e/app.spec.ts#credential-vault/encrypted-only-rollback`
