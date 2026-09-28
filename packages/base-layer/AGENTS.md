# AGENTS.md

Guidance for working on the shared Nuxt layer package.

## Package purpose

`packages/base-layer` is the shared Nuxt layer for the Frigear.nu monorepo. It contains the common Nuxt configuration, module setup, and app defaults consumed by:

- `apps/website`
- `apps/**`

This package should stay framework- and app-agnostic enough to serve both websites without duplicating setup.

## Versioning and tooling

- Node.js: `24.6.0`
- PNPM: `11.24.0`
- Monorepo manager: pnpm workspaces (`pnpm-workspace.yaml`)

Use the repo's pinned versions from the root rather than installing a different local toolchain.

## Working conventions

- Run commands from the repo root, not inside this package directory.
- Prefer workspace-aware commands with `pnpm --filter` when validating or running package-scoped tasks.
- Keep shared config and module changes backward-compatible for both apps.
- If you change public behavior here, validate both consuming apps in the same change.

## Common commands

```bash
# Install dependencies from the repo root
corepack enable
pnpm install

# Validate this package
pnpm --filter '@frigear-nu/base' lint
pnpm --filter '@frigear-nu/base' typecheck

# Run apps that consume the layer
pnpm --filter @frigear-nu/website dev
```

## Notes

- Use `workspace:*` for internal package links when wiring this layer into apps.
- Update the lockfile with `pnpm install` when dependencies change.
- Keep documentation aligned with the actual shared behavior of the layer.
- Always keep README.md & this AGENTS.md (relevant) up to date with changes and conventions.
