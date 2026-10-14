# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## Repo layout

```
/apps/website     Nuxt 4.5 application (the product)
/apps/docs        Nuxt 4.5 / docus.dev documentation site (this repo's docs)
/apps/**          Other Apps - could be any language or deployment target.
/packages/**      Shared workspace packages (ui, config, types, utils, etc.)
```

This is a pnpm workspace monorepo. Packages under `packages/**` are consumed by `apps/website` (and each other) via
workspace protocol dependencies (`"@scope/name": "workspace:*"`). Assume pnpm unless a package's own README says
otherwise — adjust commands accordingly if this repo actually uses npm/yarn.

All commands below are run from the repo root — including commands scoped to a single app or package. Never `cd` into
`apps/<name>` or `packages/<name>`
and run a command there: pnpm resolves workspace-protocol dependencies (`workspace:*`) relative to the root, so running
from inside a subfolder can fail to resolve internal packages, or silently use the wrong lockfile/node_modules. Never
run `npm install` / `yarn` inside a subfolder either — it will desync the lockfile.

To scope a command to one app or package, stay at the root and use
`--filter` (no short alias — spell it out; `-f` means `--force` in pnpm and will not do what you want here):

```bash
pnpm --filter ./apps/<name> <command>
pnpm --filter '<pkg-name>' <command>       # pkg-name = "name" field in its package.json
```

The current list of apps and packages is tracked in the repo root
`README.md`, not here — check it rather than assuming this file is exhaustive.

---

## Setup

```bash
pnpm install          # installs all workspaces from repo root; do not install per-package
```

---

## Adding a new app to the workspace

New apps are scaffolded with [giget](https://github.com/unjs/giget) rather than created ad hoc, so they inherit the
workspace's shared tooling and conventions from the start.

From the repo root:

```bash
cd apps
```

**Nuxt app:**

```bash
pnpm create nuxt@latest -t gh:hareland/nuxt-app-template <app-name>
```

**Any other template:**

```bash
pnpx giget@latest gh:hareland/nuxt-app-template <app-name>
```

**Bringing in an existing app / arbitrary source:**

```bash
pnpx giget@latest <source:gh/ssh++> <destination>
```

After scaffolding: run `pnpm install` from the repo root, add the new app to the root `README.md`'s app list, and wire
up any workspace-shared packages (`packages/**`) it needs as `workspace:*` dependencies.

---

## Common commands

```bash
pnpm dev                        # start apps/website dev server
pnpm --filter ./apps/website dev          # same, explicit filter
pnpm build                      # build all workspaces
pnpm --filter ./apps/website build        # build only the web app
pnpm --filter '<pkg-name>' build      # build a single package (name = "name" field in its package.json)
pnpm typecheck                  # nuxi typecheck / tsc across workspaces
pnpm lint                       # eslint across workspaces
pnpm lint:fix
pnpm test                       # run all tests
pnpm --filter '<pkg-name>' test       # run tests for one package
```

Run all of the above from the repo root, even the filtered ones — see the note above about `-f` vs `cd`-ing into a
subfolder.

If `turbo.json` or `nx.json` exists at the root, prefer
`pnpm turbo run <task>` / `pnpm nx run-many -t <task>` over looping `-f`
manually — check before assuming plain pnpm scripts are the only path.

---

## `apps/website` (Nuxt 4.5)

- Uses the Nuxt 4 directory structure: source lives under `apps/website/app/`
  (`app/components`, `app/composables`, `app/pages`, `app/layouts`,
  `app/middleware`, `app/utils`). Server code (event handlers, server-only utils) lives in `apps/website/server/`. Don't
  recreate the old Nuxt 3 top-level `components/`, `pages/`, etc. folders outside `app/`.
- `nuxt.config.ts` is the source of truth for modules, runtime config, and aliases — check it before assuming a module
  or alias exists.
- Auto-imports are enabled for `app/components`, `app/composables`, and
  `app/utils`. Don't manually import things Nuxt already auto-imports; do add explicit imports for anything pulled from
  a `packages/**` dependency.
- Prefer `<script setup lang="ts">` for all new components.
- Use Nuxt's `runtimeConfig` (`nuxt.config.ts`) for environment variables, not raw `process.env` reads inside
  components/composables.
- After changing `nuxt.config.ts`, module options, or adding a new
  `packages/**` dependency, restart the dev server / rerun `nuxi prepare` so
  `.nuxt/` types regenerate — stale `.nuxt` types are a common false-positive source for typecheck errors.

## `apps/docs` (Docus.dev & Nuxt 4.5)

- This app documents this entire repository - mainly for use as a technical documentation for developers that build on top of the ecosystem within `@frigear`
  documentation site for the product in `apps/website` — that belongs in `apps/website` itself.
- Uses the Nuxt 4 directory structure: source lives under `apps/docs/app/`
  (`app/components`, `app/composables`, `app/pages`, `app/layouts`,
  `app/middleware`, `app/utils`). Server code (event handlers, server-only utils) lives in `apps/docs/server/`. Don't
  recreate the old Nuxt 3 top-level `components/`, `pages/`, etc. folders outside `app/`.
- Is built on [docus.dev](https://docus.dev/) — check its docs for guidance on writing content, configuring the site, and
  customizing the theme and how to structure content.
- the `apps/docs/README.md` is the source of truth for how to run and build the docs site.

## `packages/**` (shared workspace packages)

- Each package is independently publishable/consumable: it must have its own `package.json` with a `name`, `main`/
  `exports`, and `types` field. Don't add code to a package without checking its `exports` map — unexported files aren't
  reachable from `apps/website`.
- Keep packages framework-agnostic where possible. Nuxt-specific glue (Vue composables that need Nuxt context, Nuxt
  modules) belongs in a clearly named package (e.g. `packages/nuxt-*`) or directly in `apps/website`, not mixed into generic
  utility packages.
- When you change a package's public API, check for consumers with:
  ```bash
  pnpm -r exec grep -l "@scope/<pkg-name>" package.json
  ```
  and update `apps/website` (and any other consuming package) in the same change.
- Build packages before relying on their compiled output in `apps/website` if the workspace resolves compiled (not source)
  output — check whether
  `apps/website`'s Vite/Nuxt config aliases packages to `src` or to `dist`.
- New packages: match the existing structure of a sibling package (tsconfig, build tool, test setup) rather than
  introducing a new toolchain.

### Authentication in server routes

- Authenticate server routes with `requireAuth(event, { scopes?, sessionOnly? })` from `@frigear-nu/auth` (the
  principal: `user`, `kind`, `scopes`) or `requireUser(event, options)` from `@frigear-nu/users` (just the user), not
  with nuxt-auth-utils' `requireUserSession`. Both resolve cookie sessions, user API tokens and OAuth access tokens.
  `getUserSession` is only for flows that are session by nature (login, logout, OAuth consent).
- Sign-in belongs to `@frigear-nu/auth` (settings under `authentication.settings`); `@frigear-nu/users` owns the user
  entity, the admin and self-service changes. Auth reaches users only through the `AuthUserStore` that users registers.
- Define staff gates with `definePolicyGate('<module>:authorize')` and offer staff scopes with `defineStaffScopes`
  (both from `@frigear-nu/auth`), not with a hook of your own.
- Anything that changes who the user is or how they sign in (password, email, passkeys, API tokens, billing portal,
  admin) must pass `sessionOnly: true`. Register the scopes a module understands with `addAuthScope`.
- Host policy hooks (`*:authorize`) must identify the caller from `ctx.userId`, never from the session on `ctx.event`:
  the session is empty for bearer requests.
- A module that adds routes using `requireAuth` / `requireUser` needs `@frigear-nu/auth` (and `@frigear-nu/users` for
  `requireUser`) in its `moduleDependencies` and in `package.json`, and every fixture that includes it needs the `auth_user_tokens` migration (see below).

### Database schemas: one file per dialect

- Every module schema and extension file (`schema.sqlite.ts`, `users.sqlite.ts`, `server/db/extend.sqlite.ts`, ...)
  ships with a `.postgresql.ts` twin next to it, exporting the same tables with the same table, column and index names.
  Change both in the same commit; they must always stay in sync.
- Every package that owns a schema has a `test/schema-parity.test.ts` calling `expectSchemaParity(sqlite, postgresql)`
  from `@frigear-nu/module-kit/testing`. It compares tables, columns (drizzle data type, not null, primary key, unique,
  defaults, `$defaultFn`/`$onUpdateFn`), indexes and foreign keys. Add a case when you add a schema file. A module-kit
  test fails when a `.sqlite.ts` schema has no `.postgresql.ts` twin.
- Map the types like this, so the drizzle data types match:

  | sqlite | postgresql |
  |---|---|
  | `sqliteTable` (`drizzle-orm/sqlite-core`) | `pgTable` (`drizzle-orm/pg-core`) |
  | `integer().primaryKey({ autoIncrement: true })` | `serial().primaryKey()` |
  | `integer({ mode: 'timestamp' })` | `timestamp({ withTimezone: true })` |
  | `integer({ mode: 'boolean' })` | `boolean()` |
  | `text({ mode: 'json' })` | `jsonb()` |
  | `integer()` holding epoch milliseconds | `bigint({ mode: 'number' })` |
  | `customType({ dataType: () => 'text' })` | the same `customType` from `pg-core` |

- Runtime code must work on both dialects: no `db.run`/`db.batch`/`PRAGMA`, `rowid` or sqlite-only SQL without a
  postgres branch (see `changeId` in `packages/users/src/runtime/server/user-store.ts`).

### Database extensions and authenticated test fixtures

- `extendDatabaseTable` changes the generated Drizzle schema, not the database itself. Whenever a module adds or
  changes columns, generate and commit migrations for every affected fixture using its complete module configuration,
  including the extending modules. Commit the SQL, Drizzle snapshot, and migration journal together; these are versioned
  schema history, not disposable build artifacts.
- Prepare the fixture before generating migrations so `.nuxt/hub/db/schema.mjs` includes all registered extensions.
  Do not generate migrations from only the owning module's base schema.
- Fixtures exercising email/password registration need `authentication.settings.password` (on by default). This enables
  both login and registration APIs; `settings.pages.register` only enables the UI page.
- Database-backed auth tests use `dev: true` so NuxtHub applies committed migrations on startup. Reset only the
  fixture's dedicated `.data` directory before the suite and clean it up afterward to avoid duplicate-user failures
  on repeated runs. Assert the registration HTTP status and response body before checking the session cookie.
- A missing session cookie can be a database error, not disabled authentication: the account fixture needed an
  `accepted_terms_at` migration after the account module extended `users`. See
  `apps/docs/content/4.modules/10.module-kit.md` for the migration workflow.

---

## Code style

- TypeScript everywhere; avoid `any` — use `unknown` + narrowing, or generics.
- Follow the repo's ESLint/Prettier config as configured at the root (`eslint.config.*` / `.prettierrc*`); don't
  hand-roll formatting that conflicts with it. Run `pnpm lint --fix` before finishing a change.
- Match existing naming conventions per folder (e.g. composables prefixed
  `use*`, Pinia stores suffixed `Store`) rather than introducing new ones.

---

## Before committing / finishing a task

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test` (or scoped with `--filter` if the change is isolated to one app/package — still run from the repo root)
4. `pnpm build` for anything touching `nuxt.config.ts`, package `exports`, or build tooling, to catch build-time-only
   errors

Don't skip the workspace-wide typecheck/build even for small changes — a package's type or export change can silently
break `apps/website`.

**Never commit generated or dependency files.** The following are always excluded via `.gitignore` and must never be
staged or committed e.g:

- `node_modules/` (root and any sub-package)
- `apps/website/.nuxt/` — Nuxt generated types and build cache
- `apps/website/.output/` — production build output
- `apps/website/.data/` — local NuxtHub/D1 database files
- `dist/` — compiled package output

If you run `pnpm install` or `nuxi prepare` as part of your work, make sure none of the above appear in `git status`
before committing. Use `git rm -r --cached <path>` to untrack any files accidentally staged.

---

## PR / commit conventions

- Use Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).
- If the repo uses Changesets (`.changeset/` folder present), add a changeset for any change to a published
  `packages/**` package:
  ```bash
  pnpm changeset
  ```
  Not needed for `apps/**`-only changes.

---

## Notes for agents

- This file describes conventions inferred to be typical for a pnpm + Nuxt 4 monorepo of this shape. If actual scripts
  in the root `package.json` or a package's own `README.md`/`AGENTS.md` differ from what's written here, those local
  sources of truth win — update this file to match reality when you notice a mismatch.
- Prefer adding shared logic to `packages/**` over duplicating it inside
  `apps/**`, but don't create a new package for a single one-off helper.