# AGENTS.md

Guidance for AI coding agents (and humans) working in this workspace app.

## Notes

- Nuxt 4.5+
- `@nuxt/ui` 4.10+
- Uses `@nuxthub/db` and `@nuxthub/kv`

## Workspace layout

```
./nuxt.config.ts                    Nuxt configuration — source of truth for modules, runtime config, and aliases
./shared/**                         Code shared between ./app and ./server (must work in both environments)
./app/**                            App-specific code (browser/client + Nuxt app context only)
./server/**                         Server-specific code (Nitro/server context only)
./server/db/schema.sqlite.ts        SQLite Drizzle database schema (this is the default, and if none other exist only one..)
./server/db/schema.<dialect>.ts     <dialect> Drizzle database schema
./server/db/migrations/**           SQLite Drizzle database migrations
./server/tasks/**                   Server-side tasks (cron jobs, etc.)
./**/utils/**                       Utility functions
./shared/schema/**                  Zod schemas for shared types and auto-generated forms
./modules/**                        Nuxt modules
```

Don't put code that depends on a specific environment (browser APIs, Nitro
server context, etc.) in `./shared/**` — it needs to run in both `./app` and
`./server` unmodified.

## Useful commands

```bash
pnpm dev             # start the dev server
pnpm lint            # run ESLint
pnpm lint:fix        # run ESLint with auto-fix
pnpm db:migrate      # run Drizzle database migrations
pnpm db:generate     # generate Drizzle migration files from schema changes
pnpm db:clear        # clear the database (requires migrations to be re-applied)
pnpm db:seed         # seed the database with test data (dev server must be running)
pnpm db:seed:users   # seed the database with user data (dev server must be running)
pnpm prepare:env     # prepare environment variables for the dev server
pnpm prepare:certs   # prepare the public/private key pair used for encryption in the dev server
```

For other commands, see [`./package.json`](./package.json)

## Conventions

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
- Server routes (`server/api/**`) and database code (`server/db/**`) follow the rules in `packages/AGENTS.md`:
  access control, HTTP route conventions, one schema file per dialect, migrations. Read it before changing them.
