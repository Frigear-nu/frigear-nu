<!-- Working notes for the docs rewrite (generated 2026-11-05). Deleted in the final rewrite PR. -->

# Map of `apps/docs/content`

Everything below is read-only and is based on `wc -w` on the files plus their front matter. All paths are relative to `apps/docs/` inside the worktree.

## 1. Tree and word counts

The tree has 99 `.md` files and 28 `.navigation.yml` files, about 98.7k words in total. There are no other file types under `content/`, and there is no root-level `content/*.yml`.

By section (`.md` words only):

| Section | Files | Words |
| --- | --- | --- |
| `index.md` | 1 | 632 |
| `1.get-started` | 8 | 4,528 |
| `2.guide` | 14 | 14,845 |
| `3.modules` | 56 | 63,730 |
| `4.examples` | 9 | 8,673 |
| `5.contribute` | 11 | 6,206 |

Each `.navigation.yml` is 2–6 words. Where a folder has one, it is listed below as a folder-level nav file.

**`content/index.md`** is the landing page (632 words).

**`1.get-started/`** (nav file)
- `1.introduction.md` 523
- `2.installation.md` 920
- `3.project-structure.md` 583
- `4.configuration.md` 487
- `5.authentication.md` 647
- `6.adding-modules.md` 669
- `7.database.md` 429
- `8.deployment.md` 270

**`2.guide/`** (nav file)
- `1.concepts/` (nav file)
  - `1.architecture.md` 908
  - `2.auth-and-scopes.md` 1168
  - `3.extension-points.md` 1119
  - `4.database-extensions.md` 897
  - `5.identity.md` 918
- `2.ux-patterns/` (nav file)
  - `1.layouts-and-navigation.md` 717
  - `2.pages.md` 1829
  - `3.forms-and-actions.md` 887
  - `4.text-and-formatting.md` 325
- `3.best-practices/` (nav file)
  - `1.http-routes.md` 1288
- `4.going-further/` (nav file)
  - `1.own-oauth-server.md` 1376
  - `2.oauth-application.md` 2068
  - `3.signing-keys.md` 704
  - `4.stripe-setup.md` 641

**`3.modules/`** (nav file)
- `index.md` 971
- `1.identity/` (nav file)
  - `1.auth/` (nav file)
    - `index.md` 2264
    - `2.server.md` 1658
    - `3.reference.md` 1626
    - `4.client-mode.md` 3235
  - `2.users.md` 2588
  - `3.account.md` 1917
  - `4.authorization.md` 1607
  - `5.preferences.md` 787
  - `6.oauth-server/` (nav file)
    - `index.md` 1011
    - `2.server.md` 1720
    - `3.hooks.md` 884
    - `4.routes-and-clients.md` 2384
  - `8.oauth-resource.md` 850 (there is no `7.*`)
- `2.commerce/` (nav file)
  - `1.stripe.md` 1119
  - `2.payments.md` 1600
  - `3.subscriptions/` (nav file)
    - `index.md` 792
    - `2.server.md` 820
    - `3.app.md` 786
    - `4.reference.md` 966
- `3.features/` (nav file)
  - `1.events/` (nav file)
    - `index.md` 454
    - `2.server.md` 673
    - `3.app.md` 788
    - `4.reference.md` 1106
  - `2.forms/` (nav file)
    - `index.md` 735
    - `2.definition.md` 1506
    - `3.server.md` 1097
    - `4.app.md` 584
    - `5.reference.md` 1088
  - `3.cookie-consent.md` 1692
  - `4.mcp.md` 1276
- `4.interface/` (nav file)
  - `1.ui/` (nav file)
    - `index.md` 265
    - `2.page-components.md` 1337
    - `3.app-shell.md` 300
    - `4.form-inputs.md` 337
    - `5.composables.md` 1952
    - `6.reference.md` 668
  - `2.admin.md` 1799
  - `3.menu.md` 1397
  - `4.widget.md` 1137
  - `5.mobile/` (nav file)
    - `index.md` 1822
    - `2.cli-and-devices.md` 509
- `5.platform/` (nav file)
  - `1.module-kit/` (nav file)
    - `index.md` 1158
    - `2.server-toolkit.md` 1263
    - `3.registries-and-menus.md` 859
    - `4.i18n.md` 324
    - `5.database.md` 2247
  - `2.notify.md` 1026
  - `3.email-templates/` (nav file)
    - `index.md` 491
    - `2.components.md` 997
    - `3.server.md` 272
    - `4.module-emails.md` 415
  - `4.base-layer/` (nav file)
    - `index.md` 683
    - `2.content-collections.md` 1046
    - `3.layouts-and-routing.md` 339
    - `4.composables-and-utils.md` 503

**`4.examples/`** (nav file)
- `1.starters/` (nav file)
  - `1.workspace.md` 1199
  - `2.mobile.md` 2197
  - `3.mobile-standalone.md` 1866
- `2.apps/` (nav file)
  - `1.frigear-nu-website.md` 994
- `3.tasks/` (nav file)
  - `1.protect-a-route.md` 417
  - `2.add-an-admin-page.md` 533
  - `3.sell-event-tickets.md` 506
  - `4.build-a-form.md` 514
  - `5.send-an-email.md` 447

**`5.contribute/`** (nav file)
- `1.overview.md` 446
- `2.local-development.md` 493
- `3.writing-a-module/` (nav file)
  - `1.scaffold.md` 437
  - `2.setup-checklist.md` 731
  - `3.database-tables.md` 653
  - `4.testing.md` 575
- `4.publishing.md` 693
- `5.starters.md` 401
- `6.documentation.md` 515
- `7.tooling/` (nav file)
  - `1.cli.md` 1072
  - `2.eslint-config.md` 190

## 2. What each section and subsection covers

**Top-level sections**
- **`1.get-started` (Get Started, icon rocket):** the linear path from zero to a running, deployed app. It covers what Frigear is, creating the app from a starter, project layout, config, auth, adding modules, the database and deployment.
- **`2.guide` (Guide, icon book-open):** concepts, UX patterns, best practices and deeper how-tos.
- **`3.modules` (Modules, icon boxes):** one page or folder per module, grouped by category. `index.md` is "Every Frigear Nuxt module, grouped by what it does, with how they depend on each other."
- **`4.examples` (Examples, icon code-xml):** starters, a reference app and short task recipes.
- **`5.contribute` (Contribute, icon git-pull-request):** working on this repository itself.

**`2.guide` subsections**
- **`1.concepts`:** architecture (apps, base layer, modules and packages); auth and scopes; extension points (registries, hooks, menus, widgets, MCP tools); database extensions (one module owns a table, others add columns, one schema per dialect); identity (which of OAuth Server, Auth, OAuth Resource and Mobile to use when).
- **`2.ux-patterns`:** the three layouts and navigation; list, detail and tab pages with empty, failed and loading states; forms, actions and destructive confirmations; text and formatting (i18n strings, button labels, dates and money, locale links).
- **`3.best-practices`:** only `http-routes`, the URL, handler, error, response and test conventions for module APIs.
- **`4.going-further`:** using your own OIDC issuer; registering an OAuth client; signing keys and rotation; Stripe dashboard and webhook setup.

**`3.modules` categories and module folders**
- **`1.identity`:**
  - `auth/` covers sign-in, user API tokens and `requireAuth`, plus client mode (PKCE for SPAs and Capacitor). It has index, server, reference and client-mode pages.
  - `users`: the user entity and staff admin.
  - `account`: the account area and settings pages.
  - `authorization`: policy-based abilities and `<Can>`.
  - `preferences`: typed per-user preferences.
  - `oauth-server/`: an OAuth 2.0 / OIDC server, with index, helpers, hooks, and routes and clients pages.
  - `oauth-resource`: a resource server that verifies the issuer's access tokens.
- **`2.commerce`:**
  - `stripe`: core SDK, webhook and event listeners.
  - `payments`: one-time payments, Checkout and refunds.
  - `subscriptions/`: recurring plans, with index, server, app and reference pages.
- **`3.features`:**
  - `events/`: ticketed events, with index, server, app and reference pages.
  - `forms/`: database-stored forms, with index, definition, server, app and reference pages.
  - `cookie-consent`: a GDPR banner.
  - `mcp`: scope-limited MCP tools.
- **`4.interface`:**
  - `ui/`: shared components and composables on Nuxt UI, with index, page components, app shell, form inputs, composables and reference pages.
  - `admin`: the admin shell and dashboard.
  - `menu`: named navigation menus.
  - `widget`: widget and tab areas.
  - `mobile/`: a Capacitor shell, with an index page and a CLI-and-devices page.
- **`5.platform`:**
  - `module-kit/`: helpers for building modules, with index, server toolkit, registries and menus, i18n, and database pages.
  - `notify`: email, SMS and generic notification dispatch.
  - `email-templates/`: Vue email templates, with index, components, server and module-emails pages.
  - `base-layer/`: the shared Nuxt layer, with index, content collections, layouts and routing, and composables pages.

**Pattern in module folders:** the module folders usually split into `index` (overview), `server`, `app`, `reference`, with variations such as `definition` for forms and `client-mode` for auth.

**`4.examples` subsections**
- **`1.starters`:** the workspace, mobile and standalone mobile starters.
- **`2.apps`:** the frigear.nu website as a real app.
- **`3.tasks`:** five short recipes: protect a route, add an admin page, sell event tickets, build a form, send an email.

**`5.contribute` subsections**
- **`overview`, `local-development`:** repo layout and conventions; install, configure, run and validate.
- **`3.writing-a-module`:** scaffold, setup checklist, database tables, testing.
- **`publishing`, `starters`, `documentation`:** npm release; maintaining the `.starters/` templates; how the docs site is organised and written.
- **`7.tooling`:** `@frigear-nu/cli` and the shared ESLint config.

## 3. Navigation and config files

**`.navigation.yml` files**
- They set `title` and `icon` only.
- The five top-level folders have real icons: rocket, book-open, boxes, code-xml, git-pull-request.
- Every second-level folder (concepts, identity and so on) sets `icon: false`.
- Third-level module folders (auth, forms and so on) set only `title`.
- There is no root-level `content/*.yml`.

**`apps/docs/nuxt.config.ts`**
- It extends `docus`.
- `site.url` comes from `NUXT_SITE_URL`, defaulting to `https://docs.frigear.dev`. A comment says this is needed for canonical URLs and `/llms.txt`.
- It has a large `redirects` map of about 47 old routes, applied as 301s through `routeRules`. Old routes include `/getting-started/*`, `/guides/*`, `/applications/*`, `/layers/*`, `/packages/*` and flat `/modules/<x>`. The comment says published package homepages and READMEs still link to them.
- `content.experimental.sqliteConnector` is `native`.
- It sets Cloudflare wrangler `workers_dev`, `preview_urls` and `previews`.

**`apps/docs/app/app.config.ts`**
- `navigation.sub: "header"` makes one header tab per top-level folder, like nuxt.com.
- It shows the trailing chevron on sidebar groups through `ui.contentNavigation.slots.linkTrailing`.

**Theme and component overrides**
- `app/components/docs/DocsAsideLeftBody.vue` overrides Docus's sidebar. Top-level groups stay open, and nested module folders fold unless the current page is inside them.
- `app/components/docs/DocsAsideMobileBar.vue` is the mobile counterpart.
- `app/components/content/ModuleRuntime.vue` is the MDC `:module-runtime{server client mobile}` badge row shown under module intros.

**Landing page, `content/index.md`**
- It is a Docus `u-page-hero`, titled "Build on the Frigear Nuxt ecosystem".
- It has two buttons: "Create an app" (to `/get-started/installation#create-the-project`) and "Browse modules" (to `/modules`).
- It shows the command `pnpm create frigear-app my-app --platform web,mobile`.
- A `u-page-section` follows, "From zero to signed in", with three steps.
- The SEO title is "Frigear Developer Docs".

**`apps/docs/README.md`**
- It describes run and build commands (`pnpm --filter @frigear-nu/docs dev` and `build`).
- It has the folder-to-tab table.
- It says numbered prefixes set the order, and the name after the number is the route.
- It says moved or renamed pages need a `redirects` entry.
- It points to `content/5.contribute/6.documentation.md` as the full guide.

**Other app files:** `package.json` (docus `latest`, nuxt, wrangler), `public/images/email-templates/*.png` (5 images) and `app/components/` as above. There is no `app/pages` and no `server/` dir.

## 4. Existing writing guidelines, glossary and style guide

- **No standalone glossary, terminology page or style guide exists.** Grep for glossary and terminology in `apps/docs` found nothing. The only vocabulary table is the `## Vocabulary` section (Menu, Group, Source) in `content/3.modules/4.interface/3.menu.md`. There is no `CONTRIBUTING*` at the repo root. No `CLAUDE.md` or `.github` docs guide turned up either (`.github/` has only `workflows`). The only `.claude` file is `.claude/settings.local.json`.
- **`content/5.contribute/6.documentation.md`** (515 words) is the main in-site guide, with a "Where a page belongs" table, "Add or update a page" steps and a "Conventions" list.
  - **Where and how:** how to add a page (two-digit numeric prefixes, front matter with `title`, a one-sentence `description` and an optional icon) and the redirect rule.
  - **Titles:** use the plain name with no "Module" suffix; headings are sentence case.
  - **Module page layout:** intro with no H1, requirements note, `## Quick setup`, `## Options` (table: option, type, default, purpose), then `## Server`, `## App`, `## Hooks`, `## Routes`, `## Database`, `## Translations`.
  - **Code and reference:** signatures in `ts` fences; hooks, routes, options and env vars in tables.
  - **Accuracy:** verify defaults, routes and hooks against the source.
  - **Nuxt 4:** every example uses Nuxt 4 patterns.
  - **Links:** by route, never by numbered filename.
  - **Starters:** pages about a starter stay in sync with `.starters/`.
  - **Scope:** end-user docs belong in `apps/website`.
- **`apps/docs/README.md`:** the shorter version of the same structure rules.
- **`AGENTS.md` (repo root):**
  - The `apps/docs` section (around lines 162–172) says the site documents the whole repo for developers, uses Docus and the Nuxt 4 `app/` layout, and treats the docs README as the source of truth.
  - The "UX patterns" section (around line 309 onward) is UI rules that mirror `2.guide/2.ux-patterns/`. It includes a "Text" rule: strings go through `useModuleT`, buttons name the object, dates and money use `useFormat()`.
  - Lines 89–96 map each `.starters/*` to its docs page.
  - Line 218 points to `http-routes.md` as the full guide.
  - Line 304 points to `module-kit/5.database.md` for the migration workflow.
- **Other `AGENTS.md` files:** `apps/website/AGENTS.md`, `packages/base-layer/AGENTS.md` and `packages/eslint-config/AGENTS.md`. I did not read them for docs-writing rules.
- **Concept-like pages:** `2.guide/1.concepts/*` (five pages) are the nearest thing to a concepts section, and `1.get-started/1.introduction.md` plus `3.modules/index.md` are overview pages. None is a terminology or glossary page.

## 5. Largest and smallest `.md` files by word count

**10 largest**
1. `3.modules/1.identity/1.auth/4.client-mode.md`: 3235
2. `3.modules/1.identity/2.users.md`: 2588
3. `3.modules/1.identity/6.oauth-server/4.routes-and-clients.md`: 2384
4. `3.modules/1.identity/1.auth/index.md`: 2264
5. `3.modules/5.platform/1.module-kit/5.database.md`: 2247
6. `4.examples/1.starters/2.mobile.md`: 2197
7. `2.guide/4.going-further/2.oauth-application.md`: 2068
8. `3.modules/4.interface/1.ui/5.composables.md`: 1952
9. `3.modules/1.identity/3.account.md`: 1917
10. `4.examples/1.starters/3.mobile-standalone.md`: 1866

**10 smallest**
1. `5.contribute/7.tooling/2.eslint-config.md`: 190
2. `3.modules/4.interface/1.ui/index.md`: 265
3. `1.get-started/8.deployment.md`: 270
4. `3.modules/5.platform/3.email-templates/3.server.md`: 272
5. `3.modules/4.interface/1.ui/3.app-shell.md`: 300
6. `3.modules/5.platform/1.module-kit/4.i18n.md`: 324
7. `2.guide/2.ux-patterns/4.text-and-formatting.md`: 325
8. `3.modules/4.interface/1.ui/4.form-inputs.md`: 337
9. `3.modules/5.platform/4.base-layer/3.layouts-and-routing.md`: 339
10. `5.contribute/5.starters.md`: 401

All paths above are under `/Users/kristianhareland/Workspace/frigear-oss/frigear-nu/.claude/worktrees/docs-clarity-consistency-48a86d/apps/docs/content/`.
