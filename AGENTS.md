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

**An app from a starter** (`web`, `web-standalone`, `mobile`), renamed into the workspace's scope:

```bash
pnpm cli app:create <app-name> --template web
```

**Bringing in an existing app / arbitrary source:**

```bash
pnpx giget@latest <source:gh/ssh++> <destination>
```

After scaffolding: run `pnpm install` from the repo root, add the new app to the root `README.md`'s app list, and wire
up any workspace-shared packages (`packages/**`) it needs as `workspace:*` dependencies. Packages under `packages/**`
depend on each other with `workspace:^` instead, so the published ranges are carets, not exact versions, and never
have a `postinstall` (it would be published and run in consumers): the stub step is their `dev:stub` script, run by the
root `postinstall`.

### Starters (`.starters/**`)

The starters are templates for a **new project outside this repo**, each a pnpm workspace copied with
`pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/<starter> <dir>` and documented by a guide (new users begin at the quick start,
`apps/docs/content/1.get-started/2.installation.md`, which compares the starters and links to each guide):

| Starter | What it is | Guide |
| --- | --- | --- |
| `.starters/workspace` | `apps/web`: users, auth, account, admin | `apps/docs/content/4.examples/1.starters/1.workspace.md` |
| `.starters/mobile` | `apps/mobile`: a Capacitor app on `@frigear-nu/mobile` against any issuer | `apps/docs/content/4.examples/1.starters/2.mobile.md` |
| `.starters/mobile-standalone` | `workspace` + `apps/mobile`; `apps/web` adds `@frigear-nu/oauth-server` and the API | `apps/docs/content/4.examples/1.starters/3.mobile-standalone.md` |

- They are not part of this pnpm workspace (`pnpm-workspace.yaml` only lists `apps/*` and `packages/*`): they depend on
  the **published** `@frigear-nu/*` versions, never `workspace:*` or `catalog:`, and have their own `AGENTS.md`.
- **Shared files stay identical.** `.github/`, `.nvmrc`, `.gitignore`, `pnpm-workspace.yaml`, `scripts/` and
  `packages/` are the same in every starter, `apps/mobile` is the same in `mobile` and `mobile-standalone`, and
  `mobile-standalone/apps/web` differs from `workspace/apps/web` only in `nuxt.config.ts`, `package.json`,
  `.env.example`, `AGENTS.md`, the migrations and `server/api/`. Change a shared file in every starter in the same
  commit; the `drift` job of `.github/workflows/starters.yml` fails otherwise.
- `scripts/prepare-env.mjs` (`pnpm prepare:env`) is zero-dependency: it copies each `.env.example` and fills in empty
  secrets, never overwriting a value.
- Work on a starter in a copy outside the repo (`cp -R .starters/<starter> "$TMPDIR/<starter>"`, then `pnpm install`
  there) and copy the changes back. To try unreleased packages, point `@frigear-nu/*` at packed or linked builds with
  `overrides` in the copy only. Never commit its `node_modules`, `.nuxt`, `.output`, `.data`, `.env`,
  `pnpm-lock.yaml`, `capacitor.config.json` or the native `ios/` / `android/` folders.
- After releasing a module that changes a schema, or bumping a starter's versions, regenerate the migrations of every
  starter with `apps/web` in the copy (`pnpm db:generate`) and commit `apps/web/server/db/migrations` back. CI fails
  when they are out of date.
- A starter that needs an unreleased `@frigear-nu` version is skipped with a warning on pull requests and fails on
  `main`: release the packages before merging.
- Keep each guide in step with its starter's files and commands.

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
- Module runtime code: app files under `src/runtime/**` (components, composables, plugins, pages) import what they use
  from `#imports` explicitly, since Nuxt does not auto-import into a module installed in `node_modules` (lint enforces
  it with `no-undef`). Server code under `src/runtime/server/**` may rely on auto-imports, as long as the module calls
  `inlineModuleRuntime` from `@frigear-nu/module-kit/utils`.
- New packages: match the existing structure of a sibling package (tsconfig, build tool, test setup) rather than
  introducing a new toolchain.

### Authentication in server routes

Full guide: `apps/docs/content/5.contribute/3.writing-a-module/5.access-control.md`.

- Check access with `await authorize(event, 'resource:action', record?)` (auto-imported from `@frigear-nu/auth`): it
  authenticates (cookie sessions, user API tokens, OAuth access tokens) and answers `401 unauthorized` or `403`
  `session_required` / `insufficient_scope` / `forbidden`, and returns the principal (`user`, `kind`, `scopes`,
  `permissions`). `allows` / `denies` return a boolean, `inspect` the reason. `requireAuth(event, { sessionOnly? })`
  (`@frigear-nu/auth`) and `requireUser` (`@frigear-nu/users`) only authenticate, for routes every signed-in user may
  call. Never use nuxt-auth-utils' `requireUserSession`; `getUserSession` is only for flows that are session by nature
  (login, logout, OAuth consent).
- **Two-step route.** `authorize(event, permission)` before anything is loaded, then
  `authorize(event, permission, record)` once it is, so policies see the record and nothing answers 404 before 401/403.
- Sign-in belongs to `@frigear-nu/auth` (settings under `authentication.settings`); `@frigear-nu/users` owns the user
  entity, the admin and self-service changes. Auth reaches users only through the `AuthUserStore` that users registers.
- **Declare what code checks** in `src/runtime/access.ts` with `defineAccess(resource, { permissions, scopes?, roles? })`
  from `@frigear-nu/auth/access` (keys become `<resource>:<key>`, a key with a colon is a full name; i18n keys
  `<resource>.permissions.<key>` are derived), and register it in `setup()` with `registerAccess(nuxt, access, options?)`
  from `@frigear-nu/auth/utils` (`roles: false` for an opt-in role, `permissions: [...]` to narrow). Name permissions
  through it in routes and tests (`eventsAccess.permissions.manage`) rather than string literals. `addPermission`,
  `addScope`, `addRole` are the low-level calls underneath (dynamic scopes, fixtures); `addRoleRequirement` and
  `addPolicies` stay as they are. An unregistered name is a 403 for everyone and fails the build in route rules and page
  meta. Auth generates the `Permission` type from the registry, so permission parameters are typed in apps; in a
  package's own build it is `string`, and a name built at runtime needs `as Permission`. Hosts type their roles with
  `defineRoles` (`@frigear-nu/auth/access`).
  - Staff permissions get `grantTo: ['admin']`; self-service on the user's own data is `implicit` (with a policy so
    users reach only their own); anything exposing other people's data ends in `:pii` (`sensitive`, never covered by a
    wildcard).
  - Anything that changes who the user is or how they sign in (password, email, passkeys, API tokens), moves money or
    mints credentials is a `sessionOnly` permission of its own. The permission carries the rule, not the call.
- **Record rules** are policies: `definePolicy(permission, fn, { withoutRecord? })` in `server/policies.ts`, or
  `defineSharedPolicy` from `@frigear-nu/auth/policies` (synchronous, framework free) to run in the client's `can()`
  too. A policy only narrows (`false` denies, `undefined` keeps).
- **Host overrides** go in `authorization:before` (`{ event, principal, user, permission, record, allow(), deny() }`);
  inside it use `subjectAllowed(event, user, permission)`, never `allows`/`authorize` (they recurse). Roles come from
  `authorization.roles` and the `authorization:roles` hook (env allowlists). Hooks identify the user from `ctx.user`,
  never from the session on `ctx.event`: it is empty for bearer requests. There are no `<module>:authorize` hooks.
- MCP definitions take `{ permission }`; menu, widget, tab and account items take `permission` (display only: the
  route checks too). `userCan(event, userId, permission)` is for checks on another user only.
- A module that adds routes using `authorize` / `requireAuth` / `requireUser` needs `@frigear-nu/auth` (and
  `@frigear-nu/users` for `requireUser`) in its `moduleDependencies` and in `package.json`. Every fixture that includes
  it needs the `auth_user_tokens` migration with the `permissions` column (tokens freeze their permissions there; a
  missing column makes every token write fail), see
  [Database extensions and authenticated test fixtures](#database-extensions-and-authenticated-test-fixtures).

#### HTTP route conventions

Full guide: `apps/docs/content/2.guide/3.best-practices/1.http-routes.md`; the toolkit is
`@frigear-nu/module-kit/server` (explicit import, not auto-imported).

- **URLs.** Everything under `/api/<module>`; staff routes under `/api/admin/<module>/...` (the module's main resource
  is the module path: `GET /api/admin/events`, `GET /api/admin/events/:id`); the caller's own things under
  `/api/<module>/me/...`. Ids are path params, collections plural, non-CRUD actions `POST /<resource>/:id/<verb>`.
  Partial update is PATCH, replace-a-value PUT, a state change is never GET. Exceptions: `/.well-known/*`, `/oauth/*`,
  webhooks and OAuth callbacks registered at a provider.
- **Registration.** `addModuleRoutes(resolver, [{ method, path, file }], { base })` from `@frigear-nu/module-kit/utils`
  in `module.ts` (`file` relative to `./runtime/server/routes/`, a `path` starting with `/` ignores `base`). Typed path
  builders live in the module's `src/runtime/utils/api.ts` and are used by app code, tests and docs instead of literals.
- **Handler order.** Authenticate/authorize, parse params, parse body/query, load the target, act. Never 404 before
  401/403.
- **Input.** h3's `getValidatedRouterParams(event, idParams().parse)` (`intIdParams` for numeric ids),
  `readValidatedBody(event, schema.parse)`, `getValidatedQuery(event, schema.parse)` with zod. No raw `readBody`,
  `getQuery` or `getRouterParam(...)!` on JSON routes, no wrappers around them.
- **Errors.** `apiError(status, code, message, data?)` or `notFound`/`forbidden`/`conflict`/`badRequest`/
  `notConfigured`/`validationError`: message in `statusMessage`, snake_case code in `data.code`.
- **Responses.** Create: `created(event, dto)` (201). Update/action: 200 + DTO. Delete/revoke: `noContent(event)` (204).
  Every response is an allowlisted DTO from a `to<Entity>Dto()` in `server/utils` (never a drizzle row), dates as ISO
  strings (`isoDate`), types in `src/types.ts`.
- **Field issues.** When a client needs per-field issues, use `schema.safeParse` + `validationError(issues)` from the
  toolkit: h3's `readValidatedBody` only carries the zod error as text (forms `submit` is the example).
- **Server util names.** Every module's `server/utils` is auto-imported into one namespace, so exported names must be
  module-prefixed (`toFormTokenDto`, `toAuthTokenDto`, not `toTokenDto`).
- **Path builders** are imported from `@frigear-nu/<pkg>/api` (not `./utils`, which pulls in `@nuxt/kit`); relative
  imports inside a package stay relative.
- **Pagination.** Admin lists use `pageQuery({ sort, filters })` + `paginate()` → `{ items, total, page, pageSize }`
  (the query keys of `useTableQuery`). Small bounded lists stay arrays.
- **Staff access.** `authorize(event, '<module>:manage')` (or a finer `resource:action`), registered with
  `grantTo: ['admin']`; a `sessionOnly` permission for credential minting, money and billing; `{ permission }` on MCP
  definitions (`ctx.can(permission)` inside a tool). The returned principal carries the `user`.
- **Tests.** `apiClient({ cookie?, bearer? })` and `expectApiError(promise, status, code?)` from
  `@frigear-nu/module-kit/testing`. Fixtures get roles without `@frigear-nu/authorization` through `addRole` and
  `setRoleProvider`. Cover a cookie session, a token with the permission, one without (`403 insufficient_scope`), a
  token on a `sessionOnly` permission (`403 session_required`), and that `resource:*` does not reach `:pii`.

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

- `registerDatabaseTable` and `extendDatabaseTable` change the generated Drizzle schema, not the database itself.
  Whenever a module adds or changes columns, generate and commit migrations for every affected fixture using its
  complete module configuration, including the extending modules. Commit the SQL, Drizzle snapshot, and migration
  journal together; these are versioned schema history, not disposable build artifacts.
- Omit `name` on both calls: `registerDatabaseTable` registers every table export of its schema file and
  `extendDatabaseTable` extends whichever tables the file has a matching export for. Pass `name` only to restrict
  (for example auth's feature-dependent table list). Schema files are plain drizzle tables parsed as text, so keep them
  to imports and table calls; `factory` / `defineExtendableTable` are deprecated.
- A host application extends tables from its own `server/db/extend.<dialect>.ts` (one exported table or columns object
  per table), merged after every module and layer. The host generates and commits its own migration for it.
- Prepare the fixture before generating migrations so `.nuxt/hub/db/schema.mjs` includes all registered extensions.
  Do not generate migrations from only the owning module's base schema. From the repo root, with an absolute `--cwd`:
  `pnpm --filter @frigear-nu/<pkg> exec nuxt db generate --cwd "$PWD/packages/<pkg>/test/fixtures/<fixture>"`.
  After changing a schema or an extension, run it for every fixture that has committed migrations: it must print
  `No schema changes, nothing to migrate` and leave `git status 'packages/*/test/fixtures'` clean. If it creates a
  migration, the fixture needs one (see the module-kit page for naming it); delete any stray generated migration you
  do not intend to commit.
- Fixtures exercising email/password registration need `authentication.settings.password` (on by default). This enables
  both login and registration APIs; `settings.pages.register` only enables the UI page.
- Database-backed auth tests use `dev: true` so NuxtHub applies committed migrations on startup. Reset only the
  fixture's dedicated `.data` directory before the suite and clean it up afterward to avoid duplicate-user failures
  on repeated runs. Assert the registration HTTP status and response body before checking the session cookie.
- A missing session cookie can be a database error, not disabled authentication: a column added by an extending module
  without a matching fixture migration makes every write to that table fail. See
  `apps/docs/content/3.modules/5.platform/1.module-kit/5.database.md` for the migration workflow.

---

## UX patterns

Every screen follows the same patterns so the app stays predictable as modules are added. Full guide:
`apps/docs/content/2.guide/2.ux-patterns/` (docs site: `/guide/ux-patterns/*`). The building blocks
live in `packages/ui` (reference: `apps/docs/content/3.modules/4.interface/1.ui/index.md`). Rules:

- **Areas pick the layout, not the page.** Public site = base-layer `default`; `/admin/**` = `admin` (grouped sidebar:
  Overview `admin.nav.overview`, Manage `admin.nav`, Settings `admin.nav.settings`); `/account/**` = `account` (a
  settings page inside the site: site header and footer, a left section list, `PageSectionSwitcher` on narrow screens).
  `/admin/**` = `admin`, the shared `AppShell` (`@frigear-nu/ui`): no site header or footer, the account menu in the
  sidebar footer. New features go into an existing nav group; a new group needs a reason. Colour mode lives in the
  account menu, not the chrome.
- **Headings.** App pages (admin, account) use `PageHeading`, and every app page renders its own (account pages through
  `AccountHeader`, or `PageHeading` with the menu item's i18n keys); neither layout renders a heading (the admin navbar eyebrow is not one), so a
  page has exactly one `<h1>`. Public pages use `UContainer > UPage > UPageHeader`. The page root is
  `<div class="flex flex-col gap-4">`. Do not use the deprecated `Admin*` components in new code.
- **Lists** are `PageHeading` + primary action, `PageToolbar` past ~8 rows, `UTable :ui="tableUi()"` inside
  `TableCard`, clickable rows and a `RowMenu` in the last column. Status badges are `StatusBadge`. A table in a tab or on
  a detail page is `TableCard :title`, never a `flush` `SectionCard`. Empty states are `UEmpty` with exactly one action.
- **Detail pages** have a `PageHeading` breadcrumb back to the list and `SectionCard` sections (a table section is `TableCard :title`). Use `WidgetTabs`
  (`extendTabs`) when other modules can add sections, `PageTabs` when the page owns them. Light entities open in a
  slideover with the record in the URL query.
- **Create and edit** use `FormSlideover` + `UForm`/zod, opened through `useOverlay()` and resolved with the saved
  record. Cancel is `color="neutral" variant="outline"`, the primary action comes last, hints go in `UFormField`
  `description`. Inline settings forms in a `SectionCard` use `FormRow` (horizontal label/hint | control rows) in a
  `divide-y divide-default` parent; slideover forms stay vertical.
- **One `use<Entity>Actions()` composable per entity** owns create/edit/remove, toasts, refresh and `menu(record)`.
  `RowMenu` order: Open, edits, then the destructive action in its own red group (icon `trash-2`). No loose icon buttons
  in rows.
- **Destructive actions confirm** with `useConfirmDialog({ destructive: true })` and say what else is affected; never
  `window.confirm`.
- **Loading.** Pages `await` their data (`useCachedFetch` for data that should survive navigation); `useLazyFetch`
  only in widgets. Never render an empty, "join" or "not a member" state while `status` is `'pending'` or after an
  error: show a skeleton (`SectionCard`/`ListCard`/`TableCard :loading`) or the error instead.
- **Feedback** is a toast with a title and the record name; errors go through `useErrorToast` / `errorToToast`, busy
  state through `useAction`. Pass context through the URL (deep links), not state hand-offs.
- **Text.** Every string goes through `useModuleT('<ns>')` with an English fallback and `da`/`en` JSON. Buttons name the
  object ("Add unit", "Delete application"), never bare "Add"/"Delete". Dates and money via `useFormat()`; links via
  `useLocaleLink().localize` so the locale prefix survives.
- **Patterns, plus a light app theme.** Shared components add structure only; `AppShell` gives the admin area a light
  theme (chrome tones, brand tile); colours, fonts and radius stay Nuxt UI's. Status badges use `StatusBadge`
  (`statusColor`); card frames use `surfaceClass`.

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

### CI

`.github/workflows/ci.yml` runs on pull requests only, for the packages Turbo considers affected (changed packages
plus their dependents): one `Lint & build` job (lint, then a build of the affected packages and their dependencies,
not the apps) and four `Test (n/4)` jobs, each with a 10 minute ceiling. It does not run typecheck; the deploy preview
builds the apps of collaborator PRs. Almost all test time is `@nuxt/test-utils/e2e` files,
each building and booting a fixture (15–130 s on CI), so:

- Reuse an existing fixture of the package when you can; a new fixture adds its boot time to every PR that affects
  the package. Tests that need no Nuxt server go under `test/unit/`.
- `scripts/ci-test-shard.mjs` spreads the test files over the shards, weighted by `scripts/ci-test-timings.json`.
  Check the split with `node scripts/ci-test-shard.mjs all 4 --print`; when the shards drift apart, merge the
  "Measured file times" each CI shard prints at the end into the timings file.
- Root-only changes (workflows, `scripts/`) affect no package. To test everything, run the workflow by hand
  (`gh workflow run ci.yml --ref <branch>`).

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