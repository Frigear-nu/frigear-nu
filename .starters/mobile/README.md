# Frigear mobile starter

A pnpm workspace with one **Capacitor** app (`apps/mobile`): a Nuxt 4 SPA on
[`@frigear-nu/mobile`](https://docs.frigear.dev/modules/interface/mobile) with a native tab bar on iOS, signing in with
[`@frigear-nu/oauth-client`](https://docs.frigear.dev/modules/identity/oauth-client) (OAuth 2.1 + PKCE) at an issuer of your
choice: frigear.nu, your own Frigear server, Keycloak, Auth0, ... It has two tabs, **Home** (your ID token claims and a
call to `/api/me`) and **Account** (your profile and sign-out).

Want the server too? Use the [standalone mobile starter](https://docs.frigear.dev/examples/starters/mobile-standalone).

## Quick start

Requirements: Node 24 (see `.nvmrc`), pnpm 12 (`corepack enable`), and Xcode for iOS or Android Studio for Android.

```bash
pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/mobile my-app
cd my-app
git init
corepack enable
pnpm install
pnpm prepare:env
```

Point `apps/mobile/.env` at your issuer and API:

| Variable | What it is |
| --- | --- |
| `NUXT_PUBLIC_OAUTH_CLIENT_ISSUER` | The OAuth / OpenID Connect issuer, e.g. `https://id.example.com`. |
| `NUXT_PUBLIC_OAUTH_CLIENT_API_BASE` | The API `useApi()` calls with the access token. Default: the issuer. |

At the issuer, register a **public** client with the id `mobile` (see `apps/mobile/identity.ts`) and the redirect
URIs `com.example.mobile:/auth/callback` (the app) and `http://localhost:3001/auth/callback` (development), and allow
the origins `capacitor://localhost`, `https://localhost` and `http://localhost:3001` for CORS.
[Use your own OAuth server](https://docs.frigear.dev/guide/going-further/own-oauth-server) has the checklist and recipes.

```bash
pnpm dev          # http://localhost:3001 in a browser
pnpm mobile:ios   # the iOS simulator
```

Rename the app (app id, name, client id, scopes) in `apps/mobile/identity.ts`. The full guide, with devices, Android
and a production checklist, is the [Mobile starter guide](https://docs.frigear.dev/examples/starters/mobile).

## Apps

- [@workspace/mobile](./apps/mobile) - the Capacitor app

## Packages

- [@workspace/eslint-config](./packages/eslint-config) - shared lint config for packages you add

Keep these lists up to date when you add apps or packages.

## Commands

Run everything from the repository root:

| Command | What it does |
| --- | --- |
| `pnpm prepare:env` | Create each app's `.env` from `.env.example` (never overwrites a value) |
| `pnpm dev` | Start `apps/mobile` in a browser on http://localhost:3001 |
| `pnpm build` | Build every app and package (`apps/mobile`: `nuxt generate`) |
| `pnpm lint` / `pnpm lint:fix` | ESLint everywhere |
| `pnpm typecheck` | Type check everywhere |
| `pnpm test` | Run the tests of every app and package that has them |
| `pnpm mobile:native` | Create `ios/` and `android/` and register the URL scheme (safe to rerun) |
| `pnpm mobile:doctor` | List missing Capacitor plugins and URL schemes |
| `pnpm mobile:sync` | `nuxt generate` and `cap sync`, after every web change |
| `pnpm mobile:ios` | Build and run on an iOS simulator |
| `pnpm mobile:ios:device` | Build against this machine's LAN address and open Xcode, to run on a phone |
| `pnpm mobile:android` | Build and run on an Android emulator or device |
