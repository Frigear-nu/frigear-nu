# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## Repo layout

```
/apps/web         Nuxt 4 application on the @frigear-nu modules (the product)
/apps/**          Other apps - could be any language or deployment target
/packages/**      Shared workspace packages (config, types, utils, ...)
/scripts          Workspace scripts (prepare-env.mjs)
```

This is a pnpm workspace monorepo. Packages under `packages/**` are consumed by `apps/web` (and each other) via
workspace protocol dependencies (`"@workspace/name": "workspace:*"`). Each app and package has its own `AGENTS.md`
with the rules that apply there; read it before changing that folder.

All commands are run from the repo root, including commands scoped to one app or package. Never `cd` into
`apps/<name>` or `packages/<name>` and run a command there, and never run `npm install` / `yarn` inside a subfolder:
pnpm resolves `workspace:*` from the root, and a subfolder install desyncs the lockfile. Scope a command with
`--filter` (spell it out; `-f` means `--force` in pnpm):

```bash
pnpm --filter ./apps/<name> <command>
pnpm --filter '<pkg-name>' <command>       # pkg-name = "name" field in its package.json
```

The current list of apps and packages is tracked in the root `README.md`; keep it up to date.

## Frigear module docs

The `@frigear-nu/*` modules are documented at https://docs.frigear.dev. Read a module's page before configuring or
extending it. Every page is also served as Markdown at `https://docs.frigear.dev/raw/<path>.md`, which is easier to
fetch than the HTML:

- Module index: https://docs.frigear.dev/raw/modules.md
- One module: `https://docs.frigear.dev/raw/modules/<module>.md` (for example
  https://docs.frigear.dev/raw/modules/users.md)
- This starter: https://docs.frigear.dev/raw/guides/workspace-starter.md
- UX patterns: https://docs.frigear.dev/raw/getting-started/ux-patterns.md

The docs describe the latest releases; check the version installed in `apps/web/package.json` if something differs.
The source of the docs and modules is https://github.com/Frigear-nu/frigear-nu (`apps/docs/content`, `packages/*`).

---

## Setup

```bash
corepack enable
pnpm install          # installs all workspaces from the repo root
pnpm prepare:env      # creates apps/web/.env from .env.example and generates NUXT_SESSION_PASSWORD
```

## Common commands

```bash
pnpm dev                              # start apps/web
pnpm build                            # build all workspaces
pnpm --filter ./apps/web build        # build only the web app
pnpm typecheck                        # type check all workspaces
pnpm lint                             # eslint across workspaces
pnpm lint:fix
pnpm test                             # run all tests
pnpm db:generate                      # generate a migration for apps/web (commit it)
pnpm db:migrate                       # apply migrations to the local database
```

---

## Adding a new app

Scaffold new apps with [giget](https://github.com/unjs/giget) rather than creating them by hand:

```bash
pnpm create nuxt@latest -t gh:hareland/nuxt-app-template apps/<app-name>   # a plain Nuxt app
pnpx giget@latest <source> apps/<app-name>                                 # any other template or source
```

After scaffolding: delete the new app's own `pnpm-workspace.yaml`, `pnpm-lock.yaml` and `.github/`, rename its
`package.json` `name` to `@workspace/<app-name>`, run `pnpm install` from the root, add an `AGENTS.md`, and list the
app in the root `README.md`. To use the Frigear modules in it, copy the module setup from `apps/web` (see its
`AGENTS.md`).

## Adding a new package

Match the structure of an existing package. Each package needs a `package.json` with a `name` (`@workspace/<name>`),
an `exports` map and `types`; unexported files are not reachable from apps. Keep packages framework-agnostic where
possible; Nuxt-specific code (modules, composables needing Nuxt context) goes in a `packages/nuxt-*` package or in the
app.

---

## Code style

- TypeScript everywhere; avoid `any` - use `unknown` + narrowing, or generics.
- ESLint (with stylistic rules) is the formatter; run `pnpm lint:fix` before finishing a change.
- Prefer `<script setup lang="ts">` for components.

## Before committing / finishing a task

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build` for anything touching `nuxt.config.ts`, package `exports` or build tooling

Never commit generated or dependency files: `node_modules/`, `.nuxt/`, `.output/`, `.data/` (the local database),
`dist/`, `.env`. Migrations under `apps/*/server/db/migrations/` are **not** generated junk: they are the schema
history and must be committed.

## PR / commit conventions

- Use Conventional Commits (`feat:`, `fix:`, `chore:`, ...).
