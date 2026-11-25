# AGENTS.md - `apps/desktop`

A **Tauri v2** desktop app (macOS, Windows, Linux) on the published `@frigear-nu/desktop`, `@frigear-nu/auth` and
`@frigear-nu/authorization` modules, in one of two modes picked by `DESKTOP_MODE` in `.env`. Run every command from the
repository root (`pnpm --filter ./apps/desktop <command>`, or the root `desktop:*` scripts), never from this folder.
Docs: https://docs.frigear.dev/modules/interface/desktop (also `/cli` and `/local-mode`), as Markdown at
`https://docs.frigear.dev/raw/<path>.md`.

## Modes

| `DESKTOP_MODE` | What ships | Sign-in |
| --- | --- | --- |
| `remote` (default) | A static SPA (`ssr: false`, `nuxt generate` → `.output/public`) | `@frigear-nu/auth` in client mode at the issuer in `NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER`: the system browser, the redirect back as a deep link |
| `local` | The whole app (SSR, `local/server`, `@frigear-nu/users`, sqlite) compiled with Bun into a sidecar on `127.0.0.1` | `@frigear-nu/auth` in server mode: email and password, cookie sessions |

`nuxt.config.ts` reads `DESKTOP_MODE` once (`const local = ...`) and switches the modules, `hub`, `authentication`
and `desktop.mode`. Keep every mode difference there; pages work in both modes.

## Layout

```
identity.ts               app id, app name, OAuth client id, callback path, dev port, scopes: rename the app here
nuxt.config.ts            modules, guards (`routeRules`), `authentication` and `desktop` per mode, from identity.ts
.env.example              DESKTOP_MODE, NUXT_PUBLIC_AUTHENTICATION_CLIENT_* (remote), NUXT_APP_SECRET (local dev)
app/app.vue               <UApp>, a top bar with the pages once signed in
app/app.config.ts         branding of the /login page (remote mode)
app/pages/index.vue       Home: the desktop shell (useDesktop), the signed-in user and a call to /api/me
app/pages/account.vue     Account: the profile and sign-out
local/                    a Nuxt layer extended in local mode only: server routes (local/server/api/me.get.ts)
server/db/migrations/     local mode's sqlite migrations (`pnpm db:generate`), applied when the built app starts
src-tauri/                the Tauri project, created by `pnpm desktop:init` (not in the starter)
```

- Server code goes in `local/server/`, not `server/`: the remote SPA type checks `server/` without the modules that
  local mode adds (`requireUser`, the database). `server/db/migrations` stays at the root, where `nuxt db generate`
  writes.
- Who is signed in: `useUserSession()`; sign in and out: `useAuth()` (`login`, `logout`); call an API with
  `useApi(url)` or `$api`. They have the same contract in both modes: in remote mode they add the bearer token and only
  send it to the issuer and `apiBase` origins, in local mode the session cookie is the credential. Never read tokens.
- Guards are `@frigear-nu/authorization`'s: `routeRules: { '/**': { authenticated: true } }` signs in everywhere, the
  sign-in pages stay public. `useAuthorization().can('resource:action')` for what the UI shows. In remote mode the API
  decides what is allowed; in local mode the routes in `local/server` do, with `authorize(event, ...)`.
- The desktop shell: `useDesktop()` (`isDesktop`, `os`, `getVersion()`, window controls, `openExternal`). It is only
  known in the window, so read it in `onMounted` (local mode renders on the server). `<html class="desktop">` inside
  the app.
- `NUXT_PUBLIC_*` values are baked in by `nuxt generate`: rebuild after changing `.env`.
- Nuxt 4 directory structure; `<script setup lang="ts">`; Nuxt UI 4 components. Icons are bundled
  (`icon.clientBundle`) because the app often runs offline: keep using `i-lucide-*` names in `.vue` and `.ts` files.

## The Tauri project

- `pnpm desktop:init` runs `frigear-desktop init`: it creates `src-tauri/` (Cargo project, plugins, placeholder icons)
  for the **current** mode, then syncs. Local mode adds `tauri-plugin-shell` and the code that starts the sidecar to
  `src/lib.rs`. After switching `DESKTOP_MODE`, run `pnpm desktop:init --force` (it overwrites the files it creates,
  `src/lib.rs` included).
- `src-tauri/tauri.conf.json` and `capabilities/frigear.json` are partly the module's: `pnpm desktop:sync` (and every
  `desktop:dev` / `desktop:build`) merges the `desktop` options of `nuxt.config.ts` into them. Put your own permissions
  in another capability file. `src/lib.rs` is yours after `init`.
- Commit `src-tauri/` once created. Never commit `src-tauri/target/`, `gen/schemas/` or `binaries/` (its `.gitignore`).
- `pnpm desktop:doctor` checks Rust, the OS prerequisites (Xcode tools, WebView2, WebKitGTK 4.1) and, in local mode,
  Bun. `pnpm desktop:setup` (`frigear-desktop doctor --fix`) installs Rust and Bun with their official installers,
  adds missing Tauri packages and runs `init`; it never runs sudo.

## Local mode

- `pnpm dev` and `pnpm desktop:dev` run `nuxt dev`, with NuxtHub's own sqlite in `.data/` and its migrations. No
  sidecar under dev.
- `pnpm desktop:build` runs `nuxt build` (the Nitro `bun` preset, one file), compiles it with Bun into
  `src-tauri/binaries/`, then `tauri build`. The app stores its database and secrets in the OS app-data folder and
  applies `server/db/migrations` on start.
- After changing modules or their options: `pnpm db:generate` and commit the new migration.
- Email verification is off (nobody receives the email offline); `NUXT_APP_SECRET` is only for `nuxt dev`.

## Before finishing

From the repository root: `pnpm lint`, `pnpm typecheck`, `pnpm build`; after touching local mode also
`pnpm typecheck:local` and `pnpm build:local`. Never commit `.nuxt/`, `.output/`, `.data/` or `.env`.
