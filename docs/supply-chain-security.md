# Supply-chain security

Spigot uses a defense-in-depth supply-chain model across three layers.

## 1. Consumer layer

- `postinstall` is intentionally inert by default.
- Native Electron rebuilds require explicit intent:

```bash
SPIGOT_ENABLE_POSTINSTALL=1 pnpm install
pnpm run rebuild:native
```

This avoids surprise lifecycle execution during normal installs.

## 2. Package-manager layer

Spigot uses PNPM through Corepack and enforces policy in `pnpm-workspace.yaml`:

- `minimumReleaseAge: 10080` blocks package versions published in the last 7 days.
- `minimumReleaseAgeStrict: true` applies cooldown strictly.
- `trustPolicy: no-downgrade` rejects dependency versions with weaker publish trust evidence.
- `blockExoticSubdeps: true` blocks transitive git/tarball dependencies.
- `dangerouslyAllowAllBuilds: false` keeps lifecycle builds denied by default.
- `strictDepBuilds: true` turns unreviewed dependency build scripts into install failures.
- `allowBuilds` is the explicit allow/deny map for packages that need native/build hooks.

Install with:

```bash
corepack enable
pnpm install --frozen-lockfile
```

When a dependency legitimately needs a build script, review it and update `allowBuilds` instead of bypassing policy globally.

## 3. Publisher layer

Publishing is configured for npm Trusted Publishing:

- GitHub Actions workflow: `.github/workflows/publish.yml`
- Required workflow permission: `id-token: write`
- Publish command: `npm publish --provenance --access public`
- `package.json` has `publishConfig.provenance: true`

Maintainer requirements outside the repo:

1. Configure npm Trusted Publisher for repository `Spigot/spigot` and workflow `publish.yml`.
2. Require 2FA for publishing/settings on the npm package or owning org.
3. Avoid long-lived npm publish tokens. If a token exists, restrict or revoke it after trusted publishing is active.
