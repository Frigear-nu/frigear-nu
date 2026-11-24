# AGENTS.md

Guidance for AI coding agents (and humans) working in this repository.

## Repo layout

```
/apps/website     Nuxt 4.5 application (the product)
/apps/docs        Nuxt 4.5 / docus.dev documentation site (this repo's docs)
/apps/**          Other Apps - could be any language or deployment target.
/packages/**      Shared workspace packages (ui, config, types, utils, etc.)
```

This is a pnpm workspace monorepo. Packages under `packages/**` are consumed by `apps/website` (and each other) via
workspace protocol dependencies (`"@scope/name": "workspace:*"`). Assume pnpm unless a package's own README says
otherwise — adjust commands accordingly if this repo actually uses npm/yarn.

All commands below are run from the repo root — including commands scoped to a single app or package. Never `cd` into
`apps/<name>` or `packages/<name>`
and run a command there: pnpm resolves workspace-protocol dependencies (`workspace:*`) relative to the root, so running
from inside a subfolder can fail to resolve internal packages, or silently use the wrong lockfile/node_modules. Never
run `npm install` / `yarn` inside a subfolder either — it will desync the lockfile.

To scope a command to one app or package, stay at the root and use
`--filter` (no short alias — spell it out; `-f` means `--force` in pnpm and will not do what you want here):

```bash
pnpm --filter ./apps/<name> <command>
pnpm --filter '<pkg-name>' <command>       # pkg-name = "name" field in its package.json
```

The current list of apps and packages is tracked in the repo root
`README.md`, not here — check it rather than assuming this file is exhaustive.

---

## Setup

```bash
pnpm install          # installs all workspaces from repo root; do not install per-package
```

---

## Adding a new app to the workspace

New apps are scaffolded with [giget](https://github.com/unjs/giget) rather than created ad hoc, so they inherit the
workspace's shared tooling and conventions from the start.

From the repo root:

```bash
cd apps
```

**Nuxt app:**

```bash
pnpm create nuxt@latest -t gh:hareland/nuxt-app-template <app-name>
```

**Any other template:**

```bash
pnpx giget@latest gh:hareland/nuxt-app-template <app-name>
```

**An app of a platform** (`web`, `web-standalone`, `mobile`, `desktop`), renamed into the workspace's scope, with its
root scripts:

```bash
pnpm cli platform add <platform> <app-name>
```

**Bringing in an existing app / arbitrary source:**

```bash
pnpx giget@latest <source:gh/ssh++> <destination>
```

After scaffolding: run `pnpm install` from the repo root, add the new app to the root `README.md`'s app list, and wire
up any workspace-shared packages (`packages/**`) it needs as `workspace:*` dependencies. Packages under `packages/**`
depend on each other with `workspace:^` instead, so the published ranges are carets, not exact versions, and never
have a `postinstall` (it would be published and run in consumers): the stub step is their `dev:stub` script, run by the
root `postinstall`.

### Starters (`.starters/**`)

The starters are templates for a new project outside this repo, copied with
`pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/<starter> <dir>`, and not part of this workspace. Before changing
one, read `.starters/AGENTS.md`.

---

## Common commands

```bash
pnpm dev                        # start apps/website dev server
pnpm --filter ./apps/website dev          # same, explicit filter
pnpm build                      # build all workspaces
pnpm --filter ./apps/website build        # build only the web app
pnpm --filter '<pkg-name>' build      # build a single package (name = "name" field in its package.json)
pnpm typecheck                  # nuxi typecheck / tsc across workspaces
pnpm lint                       # eslint across workspaces
pnpm lint:fix
pnpm test                       # run all tests
pnpm --filter '<pkg-name>' test       # run tests for one package
```

Run all of the above from the repo root, even the filtered ones — see the note above about `-f` vs `cd`-ing into a
subfolder.

If `turbo.json` or `nx.json` exists at the root, prefer
`pnpm turbo run <task>` / `pnpm nx run-many -t <task>` over looping `-f`
manually — check before assuming plain pnpm scripts are the only path.

---

## More rules, next to the code

Agents load these when they work in that folder; read them by hand when your change reaches into one.

| File | Covers |
| --- | --- |
| `packages/AGENTS.md` | package basics, access control in server routes, HTTP route conventions, database schemas, migrations and test fixtures (also for `apps/website/server/**`) |
| `apps/website/AGENTS.md` | the product app: layout, commands, Nuxt conventions |
| `apps/docs/AGENTS.md` | the docs site |
| `.starters/AGENTS.md` | working on the starters: shared files, migrations, drift checks |

---

## UX patterns

Every screen follows the same patterns so the app stays predictable as modules are added. Full guide:
`apps/docs/content/2.guide/2.ux-patterns/` (docs site: `/guide/ux-patterns/*`). The building blocks
live in `packages/ui` (reference: `apps/docs/content/3.modules/7.interface/1.ui/index.md`). Rules:

- **Areas pick the layout, not the page.** Public site = base-layer `default`; `/admin/**` = `admin` (grouped sidebar:
  Overview `admin.nav.overview`, Manage `admin.nav`, Settings `admin.nav.settings`); `/account/**` = `account` (a
  settings page inside the site: site header and footer, a left section list, `PageSectionSwitcher` on narrow screens);
  `/dashboard/**` = `dashboard` (the same frame with the `dashboard` menu, where signed-in users land). Account holds
  settings about the user; things the user does (crew, shifts, tickets, help) go in the dashboard menu under
  `resolveDashboardHubPath`, with `WidgetTabs` when other modules add views (`crew.dashboard`).
  `/admin/**` = `admin`, the shared `AppShell` (`@frigear-nu/ui`): no site header or footer, the account menu in both
  the sidebar footer and the top bar next to the language flag (every screen width; `AppShell`'s `navbar-actions`
  slot). New features go into an existing nav group; a new group needs a reason. Colour mode lives in the account menu,
  not the chrome.
- **Headings.** App pages (admin, account) use `PageHeading`, and every app page renders its own (account pages through
  `AccountHeader`, or `PageHeading` with the menu item's i18n keys); neither layout renders a heading (the admin navbar eyebrow is not one), so a
  page has exactly one `<h1>`. Public pages use `UContainer > UPage > UPageHeader`. The page root is
  `<div class="flex flex-col gap-4">`. Do not use the deprecated `Admin*` components in new code.
- **Lists** are `PageHeading` + primary action, `PageToolbar` past ~8 rows, `UTable :ui="tableUi()"` inside
  `TableCard`, clickable rows and a `RowMenu` in the last column. Status badges are `StatusBadge`. A table in a tab or on
  a detail page is `TableCard :title`, never a `flush` `SectionCard`. Empty states are `UEmpty` with exactly one action.
- **Detail pages** have a `PageHeading` breadcrumb back to the list and `SectionCard` sections (a table section is `TableCard :title`). Use `WidgetTabs`
  (`extendTabs`) when other modules can add sections, `PageTabs` when the page owns them. Light entities open in a
  slideover with the record in the URL query.
- **Create and edit** use `FormSlideover` + `UForm`/zod, opened through `useOverlay()` and resolved with the saved
  record. Cancel is `color="neutral" variant="outline"`, the primary action comes last, hints go in `UFormField`
  `description`. Inline settings forms in a `SectionCard` use `FormRow` (horizontal label/hint | control rows) in a
  `divide-y divide-default` parent; slideover forms stay vertical.
- **One `use<Entity>Actions()` composable per entity** owns create/edit/remove, toasts, refresh and `menu(record)`.
  `RowMenu` order: Open, edits, then the destructive action in its own red group (icon `trash-2`). No loose icon buttons
  in rows.
- **Destructive actions confirm** with `useConfirmDialog({ destructive: true })` and say what else is affected; never
  `window.confirm`.
- **Loading.** Pages `await` their data (`useCachedFetch` for data that should survive navigation); `useLazyFetch`
  only in widgets. Never render an empty, "join" or "not a member" state while `status` is `'pending'` or after an
  error: show a skeleton (`SectionCard`/`ListCard`/`TableCard :loading`) or the error instead. Anything lazy (a tab,
  a widget, an async component) shows a skeleton while it loads, never a blank space: `WidgetTabs` does it for its
  tabs; panels a page switches itself go in `<Suspense :key="tab">` with a skeleton `#fallback`.
- **Feedback** is a toast with a title and the record name; errors go through `useErrorToast` / `errorToToast`, busy
  state through `useAction`. Pass context through the URL (deep links), not state hand-offs.
- **Text.** Every string goes through `useModuleT('<ns>')` with an English fallback and `da`/`en` JSON. Buttons name the
  object ("Add unit", "Delete application"), never bare "Add"/"Delete". Dates and money via `useFormat()`; links via
  `useLocaleLink().localize` so the locale prefix survives.
- **Patterns, plus a light app theme.** Shared components add structure only; `AppShell` gives the admin area a light
  theme (chrome tones, brand tile); colours, fonts and radius stay Nuxt UI's. Status badges use `StatusBadge`
  (`statusColor`); card frames use `surfaceClass`.

---

## Code style

- TypeScript everywhere; avoid `any` — use `unknown` + narrowing, or generics.
- Follow the repo's ESLint/Prettier config as configured at the root (`eslint.config.*` / `.prettierrc*`); don't
  hand-roll formatting that conflicts with it. Run `pnpm lint --fix` before finishing a change.
- Match existing naming conventions per folder (e.g. composables prefixed
  `use*`, Pinia stores suffixed `Store`) rather than introducing new ones.

---

## Before committing / finishing a task

1. `pnpm lint`
2. `pnpm typecheck`
3. `pnpm test` (or scoped with `--filter` if the change is isolated to one app/package — still run from the repo root)
4. `pnpm build` for anything touching `nuxt.config.ts`, package `exports`, or build tooling, to catch build-time-only
   errors

Don't skip the workspace-wide typecheck/build even for small changes — a package's type or export change can silently
break `apps/website`.

### CI

`.github/workflows/ci.yml` runs on pull requests and in the merge queue: one `Lint & build` job (lint, then a build
of the packages Turbo considers affected, changed packages plus their dependents, and their dependencies, not the
apps) and four `Test (n/4)` jobs, each with a 10 minute ceiling. Tests run in two tiers: a pull request tests only the
packages it changes (`--changed`), the merge queue tests the changed packages plus all their dependents (`--affected`)
before anything reaches `main`. Merge through the queue; label a PR `full-ci` to get the queue's set on its next push. It does not run typecheck; the deploy preview
builds the apps of collaborator PRs. Almost all test time is `@nuxt/test-utils/e2e` files,
each building and booting a fixture (15–130 s on CI), so:

- Reuse an existing fixture of the package when you can; a new fixture adds its boot time to every PR that changes
  the package and to every queued merge that affects it. Tests that need no Nuxt server go under `test/unit/`.
- `scripts/ci-test-shard.mjs` spreads the test files over the shards, weighted by `scripts/ci-test-timings.json`.
  Check the split with `node scripts/ci-test-shard.mjs all 4 --print`; when the shards drift apart, merge the
  "Measured file times" each CI shard prints at the end into the timings file.
- Root-only changes (workflows, `scripts/`) affect no package. To test everything, run the workflow by hand
  (`gh workflow run ci.yml --ref <branch>`).

**Never commit generated or dependency files.** The following are always excluded via `.gitignore` and must never be
staged or committed e.g:

- `node_modules/` (root and any sub-package)
- `apps/website/.nuxt/` — Nuxt generated types and build cache
- `apps/website/.output/` — production build output
- `apps/website/.data/` — local NuxtHub/D1 database files
- `dist/` — compiled package output

If you run `pnpm install` or `nuxi prepare` as part of your work, make sure none of the above appear in `git status`
before committing. Use `git rm -r --cached <path>` to untrack any files accidentally staged.

---

## PR / commit conventions

- Use Conventional Commits (`feat:`, `fix:`, `chore:`, etc.).
- A breaking change in a published package (removed export, option, hook or route, moved path, new required step)
  adds a migration to `packages/cli/src/upgrades/` (`since` = the version that ships it) with a test in
  `packages/cli/test/upgrade.test.ts`, and a row in `apps/docs/content/1.get-started/9.upgrading.md`, so
  `frigear-nu upgrade` carries it to every app that depends on the package.
- If the repo uses Changesets (`.changeset/` folder present), add a changeset for any change to a published
  `packages/**` package:
  ```bash
  pnpm changeset
  ```
  Not needed for `apps/**`-only changes.

---

## Notes for agents

- This file describes conventions inferred to be typical for a pnpm + Nuxt 4 monorepo of this shape. If actual scripts
  in the root `package.json` or a package's own `README.md`/`AGENTS.md` differ from what's written here, those local
  sources of truth win — update this file to match reality when you notice a mismatch.
- Prefer adding shared logic to `packages/**` over duplicating it inside
  `apps/**`, but don't create a new package for a single one-off helper.