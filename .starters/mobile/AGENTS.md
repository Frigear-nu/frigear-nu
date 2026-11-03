# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## Repo layout

```
/apps/mobile      Capacitor app (Nuxt 4 SPA) on @frigear-nu/mobile, signing in with @frigear-nu/auth (client mode)
/apps/**          Other apps - could be any language or deployment target
/packages/**      Shared workspace packages (config, types, utils, ...)
/scripts          Workspace scripts (prepare-env.mjs)
```

This is a pnpm workspace monorepo. Packages under `packages/**` are consumed by the apps (and each other) via
workspace protocol dependencies (`"@workspace/name": "workspace:*"`). Each app and package has its own `AGENTS.md`
with the rules that apply there; read it before changing that folder.

All commands are run from the repo root, including commands scoped to one app or package. Never `cd` into
`apps/<name>` or `packages/<name>` and run a command there, and never run `npm install` / `yarn` inside a subfolder:
pnpm resolves `workspace:*` from the root, and a subfolder install desyncs the lockfile. Scope a command with
`--filter` (spell it out; `-f` means `--force` in pnpm):

```bash
pnpm --filter ./apps/<name> <command>
pnpm --filter '<pkg-name>' <command>       # pkg-name = "name" field in its package.json
```

The current list of apps and packages is tracked in the root `README.md`; keep it up to date.

## Frigear module docs

The `@frigear-nu/*` modules are documented at https://docs.frigear.dev. Read a module's page before configuring or
extending it. Every page is also served as Markdown at `https://docs.frigear.dev/raw/<path>.md`, which is easier to
fetch than the HTML:

- Module index: https://docs.frigear.dev/raw/modules.md
- One module: `https://docs.frigear.dev/raw/modules/<module>.md` (for example
  https://docs.frigear.dev/raw/modules/users.md)
- This starter: https://docs.frigear.dev/raw/guides/mobile-starter.md
- The issuer the app signs in at: https://docs.frigear.dev/raw/guides/own-oauth-server.md
- UX patterns: https://docs.frigear.dev/raw/getting-started/ux-patterns.md

The docs describe the latest releases; check the version installed in `apps/mobile/package.json` if something differs.
The source of the docs and modules is https://github.com/Frigear-nu/frigear-nu (`apps/docs/content`, `packages/*`).

---

## Setup

```bash
corepack enable
pnpm install          # installs all workspaces from the repo root
pnpm prepare:env      # creates apps/mobile/.env from .env.example (never overwrites a value)
```

## Common commands

```bash
pnpm dev                              # apps/mobile in a browser on http://localhost:3001
pnpm build                            # build all workspaces (apps/mobile: nuxt generate)
pnpm typecheck                        # type check all workspaces
pnpm lint                             # eslint across workspaces
pnpm lint:fix
pnpm test                             # run all tests
pnpm mobile:native                    # create ios/ and android/ and register the URL scheme (idempotent)
pnpm mobile:doctor                    # missing Capacitor plugins and URL schemes
pnpm mobile:sync                      # nuxt generate + cap sync, after every web change
pnpm mobile:ios                       # build and run on an iOS simulator
pnpm mobile:ios:device                # a build against this machine's LAN address, opened in Xcode for a phone
pnpm mobile:android                   # build and run on an Android emulator or device
```

---

## Adding a new app

Scaffold new apps with [giget](https://github.com/unjs/giget) rather than creating them by hand:

```bash
pnpm create nuxt@latest -t gh:hareland/nuxt-app-template apps/<app-name>   # a plain Nuxt app
pnpx giget@latest <source> apps/<app-name>                                 # any other template or source
```

After scaffolding: delete the new app's own `pnpm-workspace.yaml`, `pnpm-lock.yaml` and `.github/`, rename its
`package.json` `name` to `@workspace/<app-name>`, run `pnpm install` from the root, add an `AGENTS.md`, and list the
app in the root `README.md`. To add a web app with the Frigear modules, copy `apps/web` of the workspace starter
(`pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/workspace/apps/web apps/web`).

## Adding a new package

Match the structure of an existing package. Each package needs a `package.json` with a `name` (`@workspace/<name>`),
an `exports` map and `types`; unexported files are not reachable from apps. Keep packages framework-agnostic where
possible; Nuxt-specific code (modules, composables needing Nuxt context) goes in a `packages/nuxt-*` package or in the
app.

---

## Code style

- TypeScript everywhere; avoid `any` - use `unknown` + narrowing, or generics.
- ESLint (with stylistic rules) is the formatter; run `pnpm lint:fix` before finishing a change.
- Prefer `<script setup lang="ts">` for components.

## Before committing / finishing a task

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test`
4. `pnpm build` for anything touching `nuxt.config.ts`, package `exports` or build tooling

Never commit generated or dependency files: `node_modules/`, `.nuxt/`, `.output/`, `.data/`, `dist/`, `.env`,
`capacitor.config.json`.

## PR / commit conventions

- Use Conventional Commits (`feat:`, `fix:`, `chore:`, ...).
