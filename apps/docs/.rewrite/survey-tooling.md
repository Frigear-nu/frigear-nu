<!-- Working notes for the docs rewrite (generated 2026-11-05). Deleted in the final rewrite PR. -->

Findings for the docs app (`apps/docs`, 128 files under `content/`, 98 `.md` pages). Everything below comes from reading the repo; I ran nothing and changed nothing.

## 1. MDC component usage in `apps/docs/content`
Counts are block openers. The `:::` rows are nested blocks.

| Component | Count |
|---|---|
| `::note` | 37 |
| `::warning` | 20 |
| `:::u-page-feature` | 16 (all in `index.md`) |
| `:::tabs-item` | 10 |
| `::code-group` | 8 |
| `::u-page-section` | 5 |
| `::tabs` | 5 |
| `::tip` | 3 |
| `:::u-button` | 3 |
| `::form-embed` | 2 |
| `::u-page-hero` | 1 |

- There is no `::callout`, `::card-group`, `::steps` or `::field-group`.
- Callouts are almost all `::note` and `::warning`.
- Option and field lists are markdown tables, not `field-group`.
- The only inline MDC is one `:form-embed{...}` mention, inside backticks.
- `:module-runtime{server client}` is documented in the component comment. It had no matches in `^::` or `[^:]:` grep, so I couldn't confirm any page uses it.
- Code fences: about 420 in total. 276 are `ts`, 95 `bash`, 28 `vue`, 9 `json`, and a few `text`, `yaml`, `md` and `js`.

## 2. Front matter
- `title` and `description` are on all 98 pages, so those two are consistent.
- `navigation:` is on 84 pages. It is almost always `icon` or a `title` override ("Overview", "Reference", "Server", "App").
- `seo:` (title and description) is only on `index.md` and `1.get-started/1.introduction.md`.
- There is no `links`, `layout`, `toc` or `icon` at page level.
- Each folder has a `.navigation.yml` with `title` and `icon`. Some use `icon: false`.
- `6.documentation.md` documents the convention: `title`, a one-sentence `description`, and an optional `navigation.icon`.

## 3. Custom components (`apps/docs/app/components`)
- `content/ModuleRuntime.vue` (29 lines). It renders Server, Client and Mobile badges, used as `:module-runtime{server client}`. The comment says "shown under the intro of every module overview".
- `docs/DocsAsideLeftBody.vue` (43 lines). It overrides the Docus sidebar. Top-level groups stay open, and a module split into subpages folds unless the current page is inside it.
- `docs/DocsAsideMobileBar.vue` (125 lines). It is the mobile version of that sidebar override.
- `app/app.config.ts` sets `navigation.sub: "header"`, so each top-level folder becomes a header tab. It also shows the trailing chevron.
- `nuxt.config.ts` holds a `redirects` map of about 45 old URLs to new ones, applied as 301 `routeRules`. The comment says published package `homepage` fields and READMEs still link to the old URLs.
- It also sets `site.url` to `https://docs.frigear.dev` so `llms.txt` and canonical URLs work.

## 4. Linting, link checking and tests
- `apps/docs/package.json` has only `dev`, `build` and `generate`. There is no `lint`, `test` or `typecheck`, so the docs app is skipped by `turbo run lint`, `test` and `typecheck`.
- I found no markdownlint, cspell, remark or vitest config at the root or in `apps/docs`. `vitest.config.ts` and `eslint.config.mjs` exist only under `packages/*`.
- `.github/workflows/` has `ci.yml`, `deploy-preview.yml`, `deploy-production.yml`, `deploy-website.yml`, `release.yml` and `starters.yml`.
  - `ci.yml` runs affected-only `lint` and sharded `test` through `scripts/ci-test-shard.mjs`. Nothing there touches docs content.
  - `release.yml` has a stale comment pointing at `apps/docs/content/1.getting-started/5.publishing.md`. That path no longer exists; the page is now `5.contribute/4.publishing.md`.
- Nothing checks dead links or `/modules/...` routes. There are about 625 internal links to `/modules`, 110 to `/guide`, 61 to `/contribute`, 56 to `/examples` and 30 to `/get-started`. The only protection against broken routes is the `redirects` map.

## 5. How pages reference code
- Pages mostly use hand-written `ts`, `vue` and `bash` snippets with no sync mechanism. I found no tests that read `apps/docs`, no generated API pages and no snippet includes.
- There are only 24 source or GitHub links across all pages. Examples: `packages/users/src/runtime/server/user-store.ts` and `schema.sqlite.ts`, `packages/events/.../db/schema.sqlite.ts`, `packages/auth/src/module.ts`, and the `.starters/...` tree URLs.
- One link is a relative `../../../../packages/users/src/runtime/db/schema.sqlite.ts`. It will not resolve on the published site.
- Path builders are mentioned in prose. `2.guide/3.best-practices/1.http-routes.md` says paths should live in `src/runtime/utils/api.ts` as typed builders "the app, tests and docs use". About ten pages show builder calls, such as the forms, events, authorization, preferences, menu, ui composables and oauth-resource pages.
- Accuracy rests on the written convention in `6.documentation.md`: "Check defaults, routes and hooks against the source before documenting them." Git history shows manual correction commits such as "correct the client mode pages against the code".

## 6. i18n
- The docs are single-language (English), with no locale folders or i18n config in `apps/docs`.
- "da" shows up only as documented module behaviour: the forms server page (`da-DK`) and the base-layer content-collections page (`da`, `da-DK`, `Dansk`).

## 7. Git history for `apps/docs/content`
- 266 commits touch the content, out of 1342 in the repo.
- Recent commits are mostly feature commits that update docs alongside code, for example `feat(admin)`, `feat(authorization)`, `feat(oauth-resource)!` and `feat(cli)`.
- Pure docs commits are rarer: `docs: show pnpm create frigear-app on the front page (#258)`, `docs: show the CLI and giget as tabs...`, `docs: correct the client mode pages against the code`, `docs: Auth client mode...`.
- Most-touched paths, counting renamed ones. The older names are paths from before the restructure:
  - `4.modules.md`: 20
  - `3.layers/1.base.md`: 17
  - `4.modules/17.ui.md`: 15
  - `5.contribute/8.decisions/1.auth-modes.md`: 14 (an ADR; this file does not exist in the current tree)
  - `4.modules/10.users.md`, `10.module-kit.md`, `03.auth.md` and `01.account.md`: 13 each
  - `1.getting-started/2.introduction.md`: 13
  - `index.md`: 12
- Churn is concentrated in the module reference pages (auth, users, ui, module-kit, forms, oauth-server) and the intro and index pages.
- The tree was restructured into numbered tabs, which is why redirects exist.

## 8. AGENTS.md and docs pointers
Pointers in the root `AGENTS.md` (repo-relative paths; all verified to exist):
- Line 90, plus table rows at lines 94-96:
  - `apps/docs/content/1.get-started/2.installation.md`
  - `apps/docs/content/4.examples/1.starters/1.workspace.md`
  - `apps/docs/content/4.examples/1.starters/2.mobile.md`
  - `apps/docs/content/4.examples/1.starters/3.mobile-standalone.md`
- Line 218, "Full guide": `apps/docs/content/2.guide/3.best-practices/1.http-routes.md`.
- Line 304: `apps/docs/content/3.modules/5.platform/1.module-kit/5.database.md`.
- Line 311: `apps/docs/content/2.guide/2.ux-patterns/` (site route `/guide/ux-patterns/*`).
- Line 312: `apps/docs/content/3.modules/4.interface/1.ui/index.md`.
- Lines 162-172 cover `apps/docs` conventions and say `apps/docs/README.md` is the source of truth for running and building.
- `apps/docs/README.md` links to `./content/5.contribute/6.documentation.md`, and its table of folders duplicates the one in that page.

Pointers from published and starter files that pin URL routes:
- The `.starters/*/AGENTS.md` files (the workspace, mobile and mobile-standalone `AGENTS.md`, plus the `apps/web` and `apps/mobile` ones) link to `https://docs.frigear.dev/raw/<path>.md`.
- Several of those links use old paths that only work through the redirects: `/raw/getting-started/ux-patterns.md`, `/raw/guides/workspace-starter.md`, `/raw/guides/mobile-starter.md`, `/raw/guides/own-oauth-server.md`. Check whether `/raw/...` redirects behave the same as the page routes.
- They also use `/raw/modules.md` and `/raw/modules/<module>.md`, which looks like it needs `/modules/<module>` redirects.
- The `packages/*/package.json` `homepage` fields and READMEs link to `docs.frigear.dev/modules/...`. The paths include `/modules/interface/mobile`, `/modules/identity/oauth-server`, `/modules/identity/auth/client-mode`, `/modules/platform/module-kit` and `/contribute/tooling/cli`. Published npm copies are frozen, so renames need redirects.
- `docs/content` references `AGENTS.md` itself in `5.contribute/1.overview.md` (the root `AGENTS.md` holds the full rules), `5.contribute/5.starters.md`, `5.contribute/3.writing-a-module/2.setup-checklist.md`, `1.get-started/3.project-structure.md` and the starter pages.

## Implications for a rewrite
- Treat the numbered file paths and route slugs above as stable. If you rename or move any, add an entry to `redirects` in `apps/docs/nuxt.config.ts`.
- Update `AGENTS.md`, the `.starters` AGENTS files and `release.yml` if you move any of the pointer targets.
- There is no automated safety net: no link checker, lint or spellcheck, and the docs app has no CI job of its own. A rewrite would need a manual check of internal links and a manual comparison of snippets against source.
