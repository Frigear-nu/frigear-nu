# Frigear desktop starter

A pnpm workspace with one **Tauri v2** desktop app (`apps/desktop`) for macOS, Windows and Linux, on
[`@frigear-nu/desktop`](https://docs.frigear.dev/modules/interface/desktop). It runs in one of two modes, picked by
`DESKTOP_MODE` in `apps/desktop/.env`:

- **remote** (default): a static Nuxt 4 SPA that signs in with
  [`@frigear-nu/auth`](https://docs.frigear.dev/modules/identity/auth/client-mode) in client mode (OAuth 2.1 + PKCE, in
  the system browser) at an issuer of your choice: frigear.nu, your own Frigear server, Keycloak, Auth0, ...
- **local**: the whole app with its own server (users, email and password sign-in, sqlite), compiled with Bun into a
  sidecar that runs offline on `127.0.0.1`. See
  [Local mode](https://docs.frigear.dev/modules/interface/desktop/local-mode).

It has two pages, **Home** (the desktop shell, the signed-in user and a call to `/api/me`) and **Account** (your profile
and sign-out). Every page needs a signed-in user through one `@frigear-nu/authorization` route rule.

## Quick start

Requirements: Node 24 (see `.nvmrc`), pnpm 12 (`corepack enable`), Rust from [rustup.rs](https://rustup.rs) and your
OS's prerequisites (Xcode Command Line Tools, WebView2 and the C++ Build Tools, or WebKitGTK 4.1), and
[Bun](https://bun.sh) for local mode. `pnpm desktop:setup` installs Rust and Bun when they are missing, and
`pnpm desktop:doctor` checks the rest.

```bash
pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/desktop my-app
cd my-app
git init
corepack enable
pnpm install
pnpm prepare:env
pnpm desktop:setup    # installs Rust and Bun if missing, creates apps/desktop/src-tauri/
```

Remote mode: point `apps/desktop/.env` at your issuer and API:

| Variable | What it is |
| --- | --- |
| `NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER` | The OAuth / OpenID Connect issuer, e.g. `https://id.example.com`. |
| `NUXT_PUBLIC_AUTHENTICATION_CLIENT_API_BASE` | The API `useApi()` calls with the access token. Default: the issuer. |

At the issuer, register a **public** client with the id `desktop` (see `apps/desktop/identity.ts`) and the redirect
URIs `com.example.desk:/auth/callback` (the built app) and `http://localhost:3001/auth/callback` (development), and
allow the origins `tauri://localhost`, `http://tauri.localhost` and `http://localhost:3001` for CORS.

```bash
pnpm dev              # http://localhost:3001 in a browser
pnpm desktop:dev      # the same in a Tauri window
pnpm desktop:build    # the installers, in apps/desktop/src-tauri/target/release/bundle/
```

Local mode: set `DESKTOP_MODE=local` in `apps/desktop/.env`, run `pnpm desktop:init --force`, then the same commands.
Register an account on the sign-in page.

Rename the app (app id, name, client id, scopes) in `apps/desktop/identity.ts`. The full guide is the
[Desktop starter guide](https://docs.frigear.dev/examples/starters/desktop).

## Apps

- [@workspace/desktop](./apps/desktop) - the Tauri app

## Packages

- [@workspace/eslint-config](./packages/eslint-config) - shared lint config for packages you add

Keep these lists up to date when you add apps or packages.

## Commands

Run everything from the repository root:

| Command | What it does |
| --- | --- |
| `pnpm prepare:env` | Create each app's `.env` from `.env.example` (never overwrites a value) |
| `pnpm dev` | Start `apps/desktop` in a browser on http://localhost:3001 |
| `pnpm build` | Build every app and package (`apps/desktop`: `nuxt generate`, the remote SPA) |
| `pnpm build:local` | Build `apps/desktop` in local mode (`nuxt build`, the bundled server) |
| `pnpm lint` / `pnpm lint:fix` | ESLint everywhere |
| `pnpm typecheck` / `pnpm typecheck:local` | Type check everywhere / `apps/desktop` in local mode |
| `pnpm test` | Run the tests of every app and package that has them |
| `pnpm db:generate` | Generate a migration for local mode (commit it) |
| `pnpm desktop:setup` | Install what is missing (Rust, Bun in local mode, the Tauri packages), create `src-tauri/`, then check |
| `pnpm desktop:doctor` | Check Rust, the OS prerequisites, Bun (local mode) and the Tauri packages |
| `pnpm desktop:init` | Create `apps/desktop/src-tauri/` for the current mode (`--force` to recreate it) |
| `pnpm desktop:sync` | Merge the `desktop` options of `nuxt.config.ts` into `src-tauri/` |
| `pnpm desktop:dev` | `nuxt dev` in a Tauri window |
| `pnpm desktop:build` | Build the installers (local mode: the server compiled with Bun first) |
| `pnpm desktop:sidecar` | Local mode: only the compiled server, without Tauri |

## Upgrading

```bash
pnpx @frigear-nu/cli@latest upgrade --dry-run   # what would change
pnpx @frigear-nu/cli@latest upgrade
```

It moves every `@frigear-nu/*` version (package.json files and `pnpm-workspace.yaml`) to the latest release, applies the
code changes of the breaking releases in between, and writes `frigear-upgrade.md` with what is left to do by hand.
Then run `pnpm lint`, `pnpm typecheck` and `pnpm test`. `pnpx` caches what `@latest` resolved to for a day: if it
answers `Unknown command upgrade`, name the version (`npm view @frigear-nu/cli version`). The
[Upgrading guide](https://docs.frigear.dev/get-started/upgrading) lists the breaking changes by release.
