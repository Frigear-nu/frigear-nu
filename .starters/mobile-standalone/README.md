# Frigear standalone mobile starter

A pnpm workspace with two apps that work together out of the box:

- **`apps/web`**, a Nuxt 4 app on the [`@frigear-nu`](https://github.com/Frigear-nu/frigear-nu) modules: registration
  and login, `/account` pages, an `/admin` area with user management, and an
  [OAuth server](https://docs.frigear.dev/modules/identity/oauth-server) with the API the mobile app calls.
- **`apps/mobile`**, a **Capacitor** app on [`@frigear-nu/mobile`](https://docs.frigear.dev/modules/interface/mobile) that signs
  in at `apps/web` and calls `/api/me` with its access token.

The OAuth client of the app is registered from `apps/mobile/identity.ts`, so there is nothing to set up by hand.

## Quick start

Requirements: Node 24 (see `.nvmrc`), pnpm 12 (`corepack enable`), and Xcode for iOS or Android Studio for Android.

```bash
pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/mobile-standalone my-app
cd my-app
git init
corepack enable
pnpm install
pnpm prepare:env
```

`pnpm prepare:env` creates `apps/web/.env` and `apps/mobile/.env`, and generates the session password and the OAuth
signing key. Put your email in `NUXT_ACL_ADMINS` in `apps/web/.env` (comma separated emails that are always admins).

```bash
pnpm dev
```

1. Open http://localhost:3000, choose **Create account** and register with the email from `NUXT_ACL_ADMINS`.
2. Open http://localhost:3001, the mobile app in a browser. **Sign in** goes to `apps/web`, asks for consent and comes
   back signed in. The Home tab shows the signed-in user and `/api/me`.
3. `pnpm mobile:ios` runs it in the iOS simulator against the same server.

Rename the app (app id, name, client id, scopes) in `apps/mobile/identity.ts`. The full guide, with devices, Android
and a production checklist, is the
[Standalone mobile starter guide](https://docs.frigear.dev/examples/starters/mobile-standalone).

## Apps

- [@workspace/web](./apps/web) - the Nuxt 4 app, OAuth server and API
- [@workspace/mobile](./apps/mobile) - the Capacitor app

## Packages

- [@workspace/eslint-config](./packages/eslint-config) - shared lint config for packages you add

Keep these lists up to date when you add apps or packages.

## Commands

Run everything from the repository root:

| Command | What it does |
| --- | --- |
| `pnpm prepare:env` | Create each app's `.env` from `.env.example` and fill in empty secrets (never overwrites a value) |
| `pnpm dev` | Start `apps/web` on http://localhost:3000 and `apps/mobile` on http://localhost:3001 |
| `pnpm dev:web` / `pnpm dev:mobile` | Start one of them |
| `pnpm dev:lan` | Start `apps/web` on every interface, for a phone on the same network |
| `pnpm build` | Build every app and package |
| `pnpm lint` / `pnpm lint:fix` | ESLint everywhere |
| `pnpm typecheck` | Type check everywhere |
| `pnpm test` | Run the tests of every app and package that has them |
| `pnpm db:generate` | Generate a migration after adding or upgrading a module (commit it) |
| `pnpm db:migrate` | Apply migrations without starting the dev server |
| `pnpm mobile:native` | Create `ios/` and `android/` and register the URL scheme (safe to rerun) |
| `pnpm mobile:doctor` | List missing Capacitor plugins and URL schemes |
| `pnpm mobile:sync` | `nuxt generate` and `cap sync`, after every web change |
| `pnpm mobile:ios` | Build and run on an iOS simulator |
| `pnpm mobile:ios:device` | Build against this machine's LAN address and open Xcode, to run on a phone |
| `pnpm mobile:android` | Build and run on an Android emulator or device |

## Adding a module

```bash
pnpm --filter ./apps/web add @frigear-nu/<module>
```

Add it to `modules` in `apps/web/nuxt.config.ts`, set its options, run `pnpm db:generate` and commit the migration.
Each module's docs page lists its options, required hooks and environment variables.
