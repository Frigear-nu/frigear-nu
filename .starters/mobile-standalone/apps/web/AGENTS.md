# AGENTS.md - `apps/web`

A **Nuxt 4** app on the published `@frigear-nu` modules, and the OAuth server and API that `apps/mobile` signs in at
and calls. Run every command from the repository root
(`pnpm --filter ./apps/web <command>`), never from this folder. Module docs: https://docs.frigear.dev, also as
Markdown at `https://docs.frigear.dev/raw/<path>.md` (start with
https://docs.frigear.dev/raw/guides/mobile-standalone-starter.md). The source is
https://github.com/Frigear-nu/frigear-nu/tree/main/apps/docs/content.

## Layout

```
nuxt.config.ts                     modules and their options - the source of truth; check it before assuming a module exists
app/                               Nuxt 4 app code: pages, components, composables, layouts, middleware, utils
app/assets/css/main.css            Tailwind + Nuxt UI
server/                            Nitro: api routes, plugins, utils
server/utils/acl.ts                effectiveRole(): stored role, or 'admin' for verified emails in NUXT_ACL_ADMINS
server/utils/map-session-user.ts   session mapper (authentication.settings.session.mapper)
server/plugins/authorization-role.ts the role a user acts as (NUXT_ACL_ADMINS)
server/plugins/oauth-policy.ts     host policy of the OAuth server: OAuth admins and the roles of a user
server/api/me.get.ts               GET /api/me, the sample route apps/mobile calls with its access token
server/db/migrations/sqlite/       committed schema history, applied by NuxtHub on `nuxt dev`
modules/libsql-binding.ts          ships libsql's native binding in .output (its require is not traceable)
```

- Nuxt 4 directory structure: app code lives under `app/`. Never create Nuxt 3 style top-level `components/`, `pages/`.
- Auto-imports cover `app/components`, `app/composables`, `app/utils` and `server/utils`; import from packages
  explicitly.
- Environment variables go through `runtimeConfig` in `nuxt.config.ts` (`NUXT_*`), never raw `process.env` in app
  code. Document new ones in `.env.example`.
- After changing `nuxt.config.ts` or adding a module, restart the dev server (or `nuxt prepare`) so `.nuxt` types
  regenerate.

## The modules

Each module's page is `https://docs.frigear.dev/modules/<module>` (Markdown:
`https://docs.frigear.dev/raw/modules/<module>.md`); the full list is at https://docs.frigear.dev/modules.

| Module | Owns |
| --- | --- |
| `@frigear-nu/auth` (config key `authentication`) | Sign-in with password or passkey (pages `/login`, `/register`), sessions, API tokens, `requireAuth` |
| `@frigear-nu/users` | The `users` table, self-service profile/email/password, `/admin/users` |
| `@frigear-nu/authorization` | `users.role`, `roles` / `authenticated` route rules, `<Can>` |
| `@frigear-nu/account` | `/account/**` pages |
| `@frigear-nu/admin`, `widget`, `menu` | The `/admin` shell and dashboard, widget areas, named menus |
| `@frigear-nu/notify` | Email/SMS; the `log` driver prints emails to the terminal |
| `@frigear-nu/oauth-server` (config key `oauthServer`) | The OAuth / OpenID Connect server `apps/mobile` signs in at, `/admin/oauth` |
| `@frigear-nu/ui` | Shared components on top of Nuxt UI (`PageHeading`, `SectionCard`, `TableCard`, ...) |

Modules install the modules they depend on. To add one: `pnpm --filter ./apps/web add @frigear-nu/<module>`, add it
to `modules`, set its options from its docs page, then generate and commit a migration (see Database).

## Authentication and authorization

- Authenticate server routes with `requireAuth(event, { scopes?, sessionOnly? })` (from `@frigear-nu/auth`) or
  `requireUser(event)` (from `@frigear-nu/users`), not nuxt-auth-utils' `requireUserSession`. Both accept cookie
  sessions and API tokens. Use `sessionOnly: true` for anything that changes who the user is or how they sign in.
- Module staff areas are denied until a host policy allows them: a Nitro plugin on the module's `*:authorize` hook
  (`users:admin:authorize`, `forms:authorize`, ...) that sets `ctx.allowed`. Identify the caller from `ctx.userId`,
  never from the session on `ctx.event` (it is empty for API token requests). Reuse `effectiveRole()` so the
  `NUXT_ACL_ADMINS` allowlist applies everywhere.
- Roles: `userRoles` in `server/utils/acl.ts`. `/admin/**` is open to `admin.settings.roles` in `nuxt.config.ts`.
- The session mapper runs at sign-in: after changing `NUXT_ACL_ADMINS` or a role, sign in again.

## The OAuth server and apps/mobile

- `oauthServer.clients` registers `apps/mobile` as a public client (PKCE, no secret) from
  `@workspace/mobile/identity` (`apps/mobile/identity.ts`): its `clientId`, the native redirect URI
  `<app id>:/auth/callback` and, under `nuxt dev` only, `http://localhost:3001/auth/callback`. Rename the app there, not
  here. `NUXT_OAUTH_SERVER_CLIENTS` (JSON) replaces the list per environment.
- `oauthServer.cors.origins` lets the webviews (`capacitor://localhost`, `https://localhost`) call the token endpoints;
  `cors.paths: ['/api/']` opens your API to the same origins with `Authorization: Bearer`. The dev server's origin is
  added under `nuxt dev` only.
- Routes the app calls use `requireUser(event)` / `requireAuth(event)`: both accept the access token. Put them under
  `/api/`, and return an allowlisted object, never a database row.
- Signing key: `NUXT_OAUTH_SERVER_PRIVATE_KEY` (`pnpm prepare:env` generates one in `.env`). Without it `nuxt dev` keeps
  a dev key in `.data/oauth-server/dev-key.pem`, and a production server answers `500`. Use one key per environment.
- `/admin/oauth` lists the applications; the mobile client shows as **Managed in nuxt.config**.

## Database

- NuxtHub (`hub.db`): SQLite via libsql locally, in `.data/` (never commit it). Import `db` from `@nuxthub/db`.
- Modules register their own tables. **Every time you add, remove or upgrade a module**, run `pnpm db:generate` from
  the root and commit the new files in `server/db/migrations/sqlite/` (SQL, snapshot and `_journal.json` together).
  `No schema changes, nothing to migrate` means you are up to date.
- Your own tables go in `server/db/schema.sqlite.ts`; extend module tables in `server/db/extend.sqlite.ts`. Then
  generate a migration the same way.
- Runtime code must not use sqlite-only SQL if you plan to move to Postgres or D1 later.

## UI

- Nuxt UI 4 (`U*` components) plus the `@frigear-nu/ui` building blocks. The app is wrapped in `<UApp>` (`app/app.vue`).
- Follow the Frigear UX patterns (https://docs.frigear.dev/raw/getting-started/ux-patterns.md): admin
  pages use `PageHeading` and `SectionCard` / `TableCard`, create/edit forms use `FormSlideover`, destructive actions
  confirm with `useConfirmDialog({ destructive: true })`.
- `<script setup lang="ts">` for every component.

## Before finishing

From the repository root: `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm db:generate` (must print
`No schema changes` unless you meant to add a migration). Never commit `.nuxt/`, `.output/`, `.data/` or `.env`.
