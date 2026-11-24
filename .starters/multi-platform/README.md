# Frigear multi-platform starter

A pnpm workspace with three apps that work together out of the box:

- **`apps/web`**, a Nuxt 4 app on the [`@frigear-nu`](https://github.com/Frigear-nu/frigear-nu) modules: registration
  and login, `/account` pages, an `/admin` area with user management, and an
  [OAuth server](https://docs.frigear.dev/modules/identity/oauth-server) with the API the other apps call.
- **`apps/mobile`**, a **Capacitor** app on [`@frigear-nu/mobile`](https://docs.frigear.dev/modules/interface/mobile) that signs
  in at `apps/web` and calls `/api/me` with its access token.
- **`apps/desktop`**, a **Tauri v2** app on [`@frigear-nu/desktop`](https://docs.frigear.dev/modules/interface/desktop) for
  macOS, Windows and Linux that signs in at `apps/web`, in one of two modes (`DESKTOP_MODE` in `apps/desktop/.env`):
  - **remote** (default): a static SPA that signs in like the mobile app and calls `apps/web`'s API with its access token.
  - **local**: the whole app with its own server and sqlite database, compiled with Bun into a sidecar that runs offline.
    People sign in at `apps/web` in the system browser and keep a cookie session on the bundled server. See
    [Local mode](https://docs.frigear.dev/modules/interface/desktop/local-mode).

The OAuth clients of the apps are registered from `apps/mobile/identity.ts` and `apps/desktop/identity.ts`, so there
is nothing to set up by hand.

## Quick start

Requirements: Node 24 (see `.nvmrc`), pnpm 12 (`corepack enable`). For the native apps: Xcode for iOS or Android Studio
for Android; Rust from [rustup.rs](https://rustup.rs) and your OS's prerequisites for the desktop app, and
[Bun](https://bun.sh) for its local mode (`pnpm desktop:doctor` checks them).

```bash
pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/multi-platform my-app
cd my-app
git init
corepack enable
pnpm install
pnpm prepare:env
pnpm desktop:init     # creates apps/desktop/src-tauri/ for the current mode
```

`pnpm prepare:env` creates each app's `.env`, and generates `NUXT_APP_SECRET` (it seals the session cookie) and the
OAuth signing key. Put your email in `NUXT_ACL_ADMINS` in `apps/web/.env` (comma separated emails that are always
admins).

```bash
pnpm dev
```

1. Open http://localhost:3000, choose **Create account** and register with the email from `NUXT_ACL_ADMINS`. Then open
   the verification link printed in the terminal and press **Continue** (the list only counts for a verified address).
2. Open http://localhost:3001, the mobile app in a browser. **Sign in** goes to `apps/web`, asks for consent and comes
   back signed in. `pnpm mobile:ios` runs it in the iOS simulator against the same server.
3. Open http://localhost:3002, the desktop app in a browser, and sign in the same way. `pnpm desktop:dev` opens it in a
   Tauri window (with `pnpm dev:web` running), `pnpm desktop:build` builds the installers.

Local mode: set `DESKTOP_MODE=local` in `apps/desktop/.env`, run `pnpm desktop:init --force`, then `pnpm dev:desktop`.
**Sign in with your Example account** opens `apps/web` (in a new tab, or the system browser in the desktop window),
and the app signs in once you allowed it there.

Who may do what: modules register permissions (`users:update`, `admin:access`, ...) and roles bundle them, in
`authorization.roles` in `apps/web/nuxt.config.ts` (`admin` holds everything, `user` is every user's). Verified emails in
`NUXT_ACL_ADMINS` hold `admin` (`apps/web/server/plugins/authorization-roles.ts`); admins assign roles to everyone else
on the user's page in `/admin/users`.

Rename the apps (app id, name, client ids, scopes) in `apps/mobile/identity.ts` and `apps/desktop/identity.ts`. The full
guide, with devices, both desktop modes and a production checklist, is the
[Multi-platform starter guide](https://docs.frigear.dev/examples/starters/multi-platform).

## Apps

- [@workspace/web](./apps/web) - the Nuxt 4 app, OAuth server and API
- [@workspace/mobile](./apps/mobile) - the Capacitor app
- [@workspace/desktop](./apps/desktop) - the Tauri app

## Packages

- [@workspace/eslint-config](./packages/eslint-config) - shared lint config for packages you add

Keep these lists up to date when you add apps or packages.

## Commands

Run everything from the repository root:

| Command | What it does |
| --- | --- |
| `pnpm prepare:env` | Create each app's `.env` from `.env.example` and fill in empty secrets (never overwrites a value) |
| `pnpm dev` | Start `apps/web` on http://localhost:3000, `apps/mobile` on :3001 and `apps/desktop` on :3002 |
| `pnpm dev:web` | Start `apps/web` only |
| `pnpm dev:mobile` / `pnpm dev:desktop` | Start `apps/web` and one of the apps |
| `pnpm dev:lan` | Start `apps/web` on every interface, for a phone on the same network |
| `pnpm build` | Build every app and package (`apps/desktop`: `nuxt generate`, the remote SPA) |
| `pnpm build:local` | Build `apps/desktop` in local mode (`nuxt build`, the bundled server) |
| `pnpm lint` / `pnpm lint:fix` | ESLint everywhere |
| `pnpm typecheck` / `pnpm typecheck:local` | Type check everywhere / `apps/desktop` in local mode |
| `pnpm test` | Run the tests of every app and package that has them |
| `pnpm db:generate` | Generate the migrations of `apps/web` and of `apps/desktop`'s local mode (commit them) |
| `pnpm db:migrate` | Apply `apps/web`'s migrations without starting the dev server |
| `pnpm mobile:native` | Create `ios/` and `android/` and register the URL scheme (safe to rerun) |
| `pnpm mobile:doctor` | List missing Capacitor plugins and URL schemes |
| `pnpm mobile:sync` | `nuxt generate` and `cap sync`, after every web change |
| `pnpm mobile:ios` | Build and run on an iOS simulator |
| `pnpm mobile:ios:device` | Build against this machine's LAN address and open Xcode, to run on a phone |
| `pnpm mobile:android` | Build and run on an Android emulator or device |
| `pnpm desktop:doctor` | Check Rust, the OS prerequisites, Bun (local mode) and the Tauri packages |
| `pnpm desktop:init` | Create `apps/desktop/src-tauri/` for the current mode (`--force` to recreate it) |
| `pnpm desktop:sync` | Merge the `desktop` options of `apps/desktop/nuxt.config.ts` into `src-tauri/` |
| `pnpm desktop:dev` | `apps/desktop`'s `nuxt dev` in a Tauri window |
| `pnpm desktop:build` | Build the installers (local mode: the server compiled with Bun first) |
| `pnpm desktop:sidecar` | Local mode: only the compiled server, without Tauri |

## Adding a module

```bash
pnpx @frigear-nu/cli add <module> --app web
```

This installs `@frigear-nu/<module>` in `apps/web` and adds it to `modules` in `apps/web/nuxt.config.ts` (the same as
`pnpm --filter ./apps/web add @frigear-nu/<module>` plus the config line). Set its options, run `pnpm db:generate` and
commit the migration. Each module's docs page lists its options, required hooks and environment variables.

Your own modules go in `apps/web/modules/` (`modules/foo.ts`, loaded automatically). When one needs runtime files
(plugins, components, server routes), `pnpx @frigear-nu/cli module:folder foo --runtime` turns it into
`modules/foo/index.ts` with a `runtime/` folder; `module:move` moves it to another app or package and
`package:rename` renames a workspace package, both fixing the imports that point to it (`--dry-run` shows the changes).

## Upgrading

```bash
pnpx @frigear-nu/cli@latest upgrade --dry-run   # what would change
pnpx @frigear-nu/cli@latest upgrade
```

It moves every `@frigear-nu/*` version (package.json files and `pnpm-workspace.yaml`) to the latest release, applies the
code changes of the breaking releases in between, and writes `frigear-upgrade.md` with what is left to do by hand.
Then run `pnpm db:generate` (commit any new migration), `pnpm lint`, `pnpm typecheck` and `pnpm test`. `pnpx` caches what `@latest` resolved to for a day: if it
answers `Unknown command upgrade`, name the version (`npm view @frigear-nu/cli version`). The
[Upgrading guide](https://docs.frigear.dev/get-started/upgrading) lists the breaking changes by release.
