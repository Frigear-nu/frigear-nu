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

Set the two variables in `apps/web/.env`:

| Variable | What it is |
| --- | --- |
| `NUXT_SESSION_PASSWORD` | Encrypts the session cookie, at least 32 characters (`openssl rand -base64 32`). |
| `NUXT_ACL_ADMINS` | Comma separated emails that are always admins. Put your email here. |

```bash
pnpm dev
```

Open http://localhost:3000, choose **Create account** and register with the email from `NUXT_ACL_ADMINS`. You land on
`/account`; `/admin` is the admin dashboard and `/admin/users` the user admin. Emails (password reset, ...) are printed
in the terminal until you configure a [Notify](https://github.com/Frigear-nu/frigear-nu/tree/main/packages/notify) driver.

The full guide, including how to add more modules, is the
[Quick start](https://github.com/Frigear-nu/frigear-nu/blob/main/apps/docs/content/1.getting-started/3.quick-start.md)
in the Frigear docs.

## Apps

- [@workspace/web](./apps/web) - the Nuxt 4 app

## Packages

- [@workspace/eslint-config](./packages/eslint-config) - shared lint config for packages you add

Keep these lists up to date when you add apps or packages.

## Commands

Run everything from the repository root:

| Command | What it does |
| --- | --- |
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
