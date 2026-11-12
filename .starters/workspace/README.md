# Frigear workspace starter

A pnpm workspace with one **Nuxt 4** app (`apps/web`) built on the [`@frigear-nu`](https://github.com/Frigear-nu/frigear-nu)
modules. Out of the box it has registration and login, `/account` pages (profile, security, API tokens), and an
`/admin` area where admins manage users.

## Quick start

Requirements: Node 24 (see `.nvmrc`) and pnpm 12 (`corepack enable`).

```bash
pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/workspace my-project
cd my-project
git init
corepack enable
pnpm install
pnpm prepare:env
```

`pnpm prepare:env` creates `apps/web/.env` and generates `NUXT_APP_SECRET`, which seals the session cookie (it never
overwrites a value). Put your email in `NUXT_ACL_ADMINS` there: comma separated emails that are always admins.

```bash
pnpm dev
```

Open http://localhost:3000, choose **Create account** and register with the email from `NUXT_ACL_ADMINS`. Then open the
verification link printed in the terminal and press **Continue** (the list only counts for a verified address). You land
on `/account`; `/admin` is the admin dashboard and `/admin/users` the user admin. Emails (password reset, ...) are printed
in the terminal until you configure a [Notify](https://github.com/Frigear-nu/frigear-nu/tree/main/packages/notify) driver.

Who may do what: modules register permissions (`users:update`, `admin:access`, ...) and roles bundle them, in
`authorization.roles` in `apps/web/nuxt.config.ts` (`admin` holds everything, `user` is every user's). Verified emails in
`NUXT_ACL_ADMINS` hold `admin` (`apps/web/server/plugins/authorization-roles.ts`); admins assign roles to everyone else
on the user's page in `/admin/users`.

The full guide, including how to add more modules, is the
[Workspace starter guide](https://docs.frigear.dev/examples/starters/workspace) in the Frigear docs. For a mobile app next to
this one, see the [Standalone mobile starter](https://docs.frigear.dev/examples/starters/mobile-standalone).

## Apps

- [@workspace/web](./apps/web) - the Nuxt 4 app

## Packages

- [@workspace/eslint-config](./packages/eslint-config) - shared lint config for packages you add

Keep these lists up to date when you add apps or packages.

## Commands

Run everything from the repository root:

| Command | What it does |
| --- | --- |
| `pnpm prepare:env` | Create each app's `.env` from `.env.example` and fill in empty secrets |
| `pnpm dev` | Start `apps/web` on http://localhost:3000 |
| `pnpm build` | Build every app and package |
| `pnpm lint` / `pnpm lint:fix` | ESLint everywhere |
| `pnpm typecheck` | Type check everywhere |
| `pnpm test` | Run the tests of every app and package that has them |
| `pnpm db:generate` | Generate a migration after adding or upgrading a module (commit it) |
| `pnpm db:migrate` | Apply migrations without starting the dev server |

## Adding a module

```bash
pnpm --filter ./apps/web add @frigear-nu/<module>
```

Add it to `modules` in `apps/web/nuxt.config.ts`, set its options, run `pnpm db:generate` and commit the migration.
Each module's docs page lists its options, required hooks and environment variables.
