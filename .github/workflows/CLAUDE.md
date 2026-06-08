# GitHub Actions maintenance

The canonical convention lives in **gaia** at `.github/workflows/CLAUDE.md`. Follow
it here too. Summary:

## Pin every action to a commit SHA with a version comment

```yaml
uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
```

Version tags (even `@v6.0.2`) are mutable — a maintainer can move them. SHAs are
immutable; the trailing comment keeps it human-readable. **Never** use a floating
tag (`@v4`, `@main`).

## Choosing versions

Use `gh release -R <owner>/<repo> list --limit 5` for authoritative versions and
release dates (more reliable than web search). Only adopt versions that are at
least ~1 week old; if the latest is too recent, take the most recent one that
passes that threshold. (This mirrors the 7-day `minimumReleaseAge` we apply to
npm deps in `pnpm-workspace.yaml`.) Keep versions consistent across both
workflows; prefer the same SHAs gaia uses for shared actions.

## Inventory (keep in sync with the workflows)

| Action | SHA | Version |
|--------|-----|---------|
| `actions/checkout` | `de0fac2e` | v6.0.2 |
| `actions/setup-node` | `6044e13b` | v6.2.0 |
| `actions/create-github-app-token` | `1b10c78c` | v3.1.1 |
| `pnpm/action-setup` | `0e279bb9` | v6.0.8 (self-updates to the packageManager-pinned pnpm; v6.0.6 ran bundled pnpm 11 and broke the Node 20 leg) |

The reusable `novem-code/github-actions/.github/workflows/discord_*.yml@v2`
calls are org-internal and pinned to the `@v2` tag by convention.

## pnpm

The package manager and version are pinned via `package.json` "packageManager";
`pnpm/action-setup` reads it. Build scripts are blocked by default for
supply-chain safety — approve required ones in `pnpm-workspace.yaml`
(`allowBuilds` / `onlyBuiltDependencies`).
