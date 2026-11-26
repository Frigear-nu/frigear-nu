# AGENTS.md: starters

For working on the starters in this repository. Each starter also has its own `AGENTS.md`, which ships to the
projects made from it; this file does not (giget copies `.starters/<starter>` only).

The starters are templates for a **new project outside this repo**, each a pnpm workspace copied with
`pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/<starter> <dir>` and documented by a guide (new users begin at the quick start,
`apps/docs/content/1.get-started/2.installation.md`, which compares the starters and links to each guide):

| Starter | What it is | Guide |
| --- | --- | --- |
| `.starters/workspace` | `apps/web`: users, auth, account, admin | `apps/docs/content/4.examples/1.starters/1.workspace.md` |
| `.starters/mobile` | `apps/mobile`: a Capacitor app on `@frigear-nu/mobile` against any issuer | `apps/docs/content/4.examples/1.starters/2.mobile.md` |
| `.starters/mobile-standalone` | `workspace` + `apps/mobile`; `apps/web` adds `@frigear-nu/oauth-server` and the API | `apps/docs/content/4.examples/1.starters/3.mobile-standalone.md` |
| `.starters/desktop` | `apps/desktop`: a Tauri app on `@frigear-nu/desktop`, remote (any issuer) or local (own server) | `apps/docs/content/4.examples/1.starters/4.desktop.md` |
| `.starters/multi-platform` | `mobile-standalone` + `apps/desktop`, signing in at `apps/web` in both modes | `apps/docs/content/4.examples/1.starters/5.multi-platform.md` |

- They are not part of this pnpm workspace (`pnpm-workspace.yaml` only lists `apps/*` and `packages/*`): they depend on
  the **published** `@frigear-nu/*` versions, never `workspace:*` or `catalog:`, and have their own `AGENTS.md`.
- **Shared files stay identical.** `.github/`, `.nvmrc`, `.gitignore`, `pnpm-workspace.yaml` and `packages/` are the same in every starter, `apps/mobile` is the same in `mobile`, `mobile-standalone` and
  `multi-platform`, and `mobile-standalone/apps/web` differs from `workspace/apps/web` only in `nuxt.config.ts`,
  `package.json`, `.env.example`, `AGENTS.md`, the migrations and `server/api/`. `multi-platform/apps/web` differs from
  `mobile-standalone/apps/web` only in `nuxt.config.ts`, `package.json`, `AGENTS.md` and the migrations, and
  `multi-platform/apps/desktop` from `desktop/apps/desktop` only in `nuxt.config.ts`, `identity.ts`, `.env.example`,
  `AGENTS.md` and the migrations. Change a shared file in every starter in the same commit; the `drift` job of
  `.github/workflows/starters.yml` fails otherwise.
- `pnpm prepare:env` runs `pnpx @frigear-nu/cli prepare env` (`packages/cli/src/env/prepare.ts`): it copies each
  `.env.example` and fills in empty secrets, never overwriting a value. A starter that needs a new secret adds it to
  `BUILTIN_SECRETS` there (and releases the CLI), not a script of its own.
- Work on a starter in a copy outside the repo (`cp -R .starters/<starter> "$TMPDIR/<starter>"`, then `pnpm install`
  there) and copy the changes back. To try unreleased packages, point `@frigear-nu/*` at packed or linked builds with
  `overrides` in the copy only. Never commit its `node_modules`, `.nuxt`, `.output`, `.data`, `.env`,
  `pnpm-lock.yaml`, `capacitor.config.json`, the native `ios/` / `android/` folders or `apps/desktop/src-tauri/`
  (the guides document `pnpm desktop:init` instead).
- After releasing a module that changes a schema, or bumping a starter's versions, regenerate the migrations of every
  starter with a database in the copy (`pnpm db:generate`) and commit `apps/web/server/db/migrations` and
  `apps/desktop/server/db/migrations` (`desktop`, `multi-platform`) back. CI fails when they are out of date.
- A starter that needs an unreleased `@frigear-nu` version is skipped with a warning on pull requests and fails on
  `main`: release the packages before merging.
- Keep each guide in step with its starter's files and commands.
