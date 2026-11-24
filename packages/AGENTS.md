# AGENTS.md: packages

Rules for the workspace packages under `packages/**`. Server routes and database code in `apps/website/server/**`
follow them too. The root `AGENTS.md` (layout, commands, UX patterns, CI, commits) applies as well. A package's own
`AGENTS.md` (`base-layer`, `eslint-config`) adds to these.

## Package basics

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
- Modules run on Nitro v2 and, through Nuxt's `nitroLegacy` layer, on Nitro v3 (Nuxt 4.7+ with `nitro` installed).
  Register plugins with `addNitroPlugin`, bundle extra files with `bundleServerDependencies` (never set
  `externals` directly), branch on `getNitroVersion(nuxt)` for Nitro options v3 removed, and use only `/path` and
  `/path/**` route rule patterns. Run `.github/workflows/nitro-v3.yml` on a branch that changes server code or Nitro
  config. Guide: the module-kit docs page, "Nitro v2 and v3".
- New packages: match the existing structure of a sibling package (tsconfig, build tool, test setup) rather than
  introducing a new toolchain.

## Authentication in server routes

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
- **Grant lists** (who may see a record) are auth's: a `grants` JSON column where any one grant admits, `[]` admits
  nobody and an unknown kind fails closed. Read with `grantsCanRead(event, permission, record)` (the only anonymous
  path, through `public`), evaluate `grantsMatch` in the read permission's policy, check input with `grantListShape`
  (`@frigear-nu/auth/grants`) and `grantsValidate`. Register a kind with `extendGrants` (`@frigear-nu/auth/utils`) and
  `defineGrantKind`; `role` comes from `@frigear-nu/authorization`, so a fixture without it registers its own.
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

## Database schemas: one file per dialect

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
- D1 binds at most 100 parameters per statement: lookups by a list of ids use `chunkParams` / `inChunks` from
  `@frigear-nu/module-kit/server`, never a module's own chunk helper.

## Database extensions and authenticated test fixtures

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
  `apps/docs/content/3.modules/8.platform/1.module-kit/5.database.md` for the migration workflow.
