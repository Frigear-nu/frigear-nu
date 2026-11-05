<!-- Working notes for the docs rewrite (generated 2026-11-05). Deleted in the final rewrite PR. -->

I read the docs under `apps/docs/content` (99 Markdown files, about 98.6k words). All eight get-started pages and the five guide concept pages were read in full. For the rest I read the intros and heading structure of the guide, the examples and the module pages, and ran a heading, front-matter and word-count scan over all 56 module files. 22 of the 23 module overview pages (everything except `1.identity/3.account.md`) were read through their intros, quick setup and options.

Nothing was edited. Plan mode was on, but the task was read-only anyway, so I wrote no plan file.

`ROOT` below is `/Users/kristianhareland/Workspace/frigear-oss/frigear-nu/.claude/worktrees/docs-clarity-consistency-48a86d/apps/docs/content`. Every path is relative to it.

---

## 1. Abstraction: concepts without a task, example or outcome

1. **`2.guide/1.concepts/1.architecture.md`.** It opens with taxonomy: "Knowing which layer a piece of code belongs in tells you where to put it." The only decision aid, "Where to put new code", is at the very bottom. The page never says a reader will end up able to decide where to put something.
2. **`1.get-started/1.introduction.md`.** A "Workspace map" table (folder, kind, contents) comes before the reader has built anything, under a tip that says "Want to build an app?" The definitions are abstract: "A **layer** is shared Nuxt config that an app extends." It is repo layout, which is contributor content, inside the app-builder path.
3. **`2.guide/1.concepts/3.extension-points.md`.** The whole page is mechanisms: "A hook is a question a module asks and the host answers." It includes a raw type signature, `defineVirtualRegistry<T>`. It has no scenario such as "your Billing page shows up in the account menu". The first worked example is only linked from the last line.
4. **`2.guide/1.concepts/5.identity.md`.** It starts from roles (Issuer, Public client, Resource server, App shell) plus an ASCII diagram: "They are different roles in one OAuth 2.0 / OpenID Connect picture." The "Which one do I use?" table, the part a reader needs, comes after three abstract sections.
5. **`2.guide/2.ux-patterns/1-4`.** These are a rulebook: "These pages are the rulebook: read them before adding a screen." There are no screenshots. Of all the docs, only `3.modules/5.platform/3.email-templates/*` has images (5). Layouts, lists, slideovers and empty states are described only in words.
6. **`3.modules/4.interface/3.menu.md` and `4.widget.md`.** Both open with vocabulary: a menu "filled by one or more **sources**", and an area where "neither side knows about the other". They also say "presentation-free". Neither states the outcome, for example "add a link to the account sidebar".
7. **`3.modules/2.commerce/1.stripe.md` and `2.payments.md`.** The intros read "Provider plumbing for Stripe" and "The module is event-agnostic". They don't say "use this to take a payment", and the Payments quick setup shows config but no payment being created.
8. **`3.modules/1.identity/6.oauth-server/index.md`.** "deliberately bare-bone: it knows nothing about roles, admins or what belongs in a token". Setup step 3 says "Implement the hooks. Without them nobody is an admin", but no hook example appears on the page. The reader has to open `/hooks` to find out what to write.
9. **`3.modules/2.commerce/3.subscriptions/index.md`.** The key idea is one line with no example: "Entitlements, not roles."
10. **`3.modules/index.md`, "How they fit together".** It leads with an internal mechanism: "install what they need through `moduleDependencies`". Then come chains of module slugs (`users` installs `auth`, `notify` and `menu`). There is no diagram and no "if you want X, you end up with Y" table.
11. **`3.modules/5.platform/1.module-kit/index.md`.** "The shared toolkit behind every Frigear Nuxt module." The only quick-setup example is a module author's `setup()`. An app developer finds no task here.
12. **`3.modules/3.features/4.mcp.md`, "Rules every tool follows".** Nine rules ("Fail closed.", "No exfiltration levers.") describe behaviour. There is no sample of what an agent sees in `tools/list`, or of a tool call and its reply.

---

## 2. Terminology inconsistency

| Concept | Names used | Where |
|---|---|---|
| The app that installs modules | "host app" (30), "host application" (2), "consuming app/application" (about 9), "consumer", "your app", "the application", "the website", bare "the host" (86) | "host" bare: `2.guide/1.concepts/1.architecture.md`. "host application": `5.contribute/3.writing-a-module/1.scaffold.md`. "consuming application": `3.modules/5.platform/1.module-kit/5.database.md`, `2.guide/1.concepts/4.database-extensions.md`. "consumer": `3.modules/4.interface/3.menu.md`, `3.modules/2.commerce/2.payments.md`. "host app": `4.examples/3.tasks/3.sell-event-tickets.md`. Nowhere defines "host". |
| "host" meaning hosting platform | "the host's environment", "for your host" | `1.get-started/8.deployment.md`. It collides with "the host's decision" (`1.get-started/6.adding-modules.md`) and "host policies". |
| Privileged users | "staff" (208), "admin(s)" (777), "back office", "back-office", "Admin back office", "admin area", "admin shell", "user admin", "users admin" | Get Started says admin: `NUXT_ACL_ADMINS` in `1.get-started/2.installation.md`. The guide says "Whether a user is staff" (`2.guide/1.concepts/2.auth-and-scopes.md`). Code names are `users:admin:authorize`, `events:authorize`, `forms:manage` and `staffOnly`. `3.modules/4.interface/2.admin.md` says "back office". |
| The authenticated actor | "principal" (42), "the caller", "user", "signed-in user" (53), "actor" (16), "visitor", "guest", "anonymous" | "principal" is used undefined in `1.get-started/5.authentication.md` ("resolve to the same principal"). It is defined only in `2.guide/1.concepts/2.auth-and-scopes.md`. "actor" appears in `3.modules/1.identity/2.users.md` and the forms policy example in `1.get-started/6.adding-modules.md`. |
| OAuth provider side | "issuer" (139), "OAuth server" (about 46), "OAuth Server" (module name), "Frigear OAuth server", "Frigear server", "the provider" (19), "OpenID Connect provider/issuer/server", "identity provider", "frigear.nu" | `1.get-started/2.installation.md`: "an existing issuer (frigear.nu, your own Frigear server, Keycloak" – used before any definition. `index.md` says "a server you already have". "issuer" is defined only in `2.guide/1.concepts/5.identity.md` and `3.modules/1.identity/1.auth/4.client-mode.md`. |
| An OAuth client | "application", "OAuth application" (20), "OAuth client" (7), "public application" (3), "app", "client" | `2.guide/4.going-further/2.oauth-application.md`: "An **application** is an OAuth client". The table is `oauth_applications`, the config key is `clients`, and `3.modules/1.identity/6.oauth-server/index.md` says "Public clients". |
| Test project used by module tests | "fixture" (74), "test fixture", "consuming applications", "playground" | "fixture" is never explained in the user-facing module pages: `3.modules/1.identity/1.auth/index.md` ("in your app and in every fixture"), `3.modules/3.features/2.forms/index.md` ("Every host app and test fixture"). It is defined only in `5.contribute/3.writing-a-module/4.testing.md` ("A fixture is a minimal Nuxt app"). `3.modules/5.platform/1.module-kit/5.database.md` says fixtures are "consuming applications too". "playground": `3.modules/4.interface/1.ui/index.md`, `1.scaffold.md`. |
| Kinds of code unit | "module", "package", "layer", "extension", "building block", "Nuxt module" | `1.get-started/1.introduction.md`: Module = `packages/<module>`, Package = "any other shared code". `2.guide/1.concepts/1.architecture.md`: Package = `packages/*`, which also contains modules. Base Layer is listed under Modules though it is "(not a module)" (`3.modules/index.md`). |
| "layer" | Nuxt layer / architecture level / Nuxt layer in schema merge | "which layer a piece of code belongs in" (`2.guide/1.concepts/1.architecture.md`) versus "For each Nuxt layer" (`2.guide/1.concepts/4.database-extensions.md`) versus `3.modules/5.platform/4.base-layer/index.md`. |
| "workspace" | the whole monorepo / the starter / the user's pnpm workspace | `1.get-started/1.introduction.md` ("This repository is the pnpm workspace"), "Workspace starter" (`4.examples/1.starters/1.workspace.md`), `2.guide/1.concepts/1.architecture.md` ("The Frigear workspace"). |
| Sign in | "sign-in" (98+12), "sign in" (51+10), "log in" (20), "login" (152+3), "Create account", "register", "sign up" | Routes: `/login` and `/register` in `1.get-started/5.authentication.md` and the starters. `/sign-in` and `/sign-up` in `4.examples/2.apps/1.frigear-nu-website.md`. `register: '/sign-up'` in `3.modules/1.identity/1.auth/index.md`. "Log in with frigear.nu" versus "sign in at frigear.nu". |
| Auth modes | "server mode" (17), "server-rendered" (8), "Server-rendered client", "client mode" (73), "public client" (49), "SPA" (16), "confidential" | `3.modules/1.identity/1.auth/index.md` and `3.modules/1.identity/1.auth/2.server.md` say "server mode". `2.guide/1.concepts/5.identity.md` and `2.guide/4.going-further/*` say "server-rendered web app" and "confidential client". |
| Who decides access | "policy gate", "staff guard", "role guard", "page guard", "policy hook", "`*:authorize` hook", "host policy", "Staff gate", "policy" | `2.guide/1.concepts/2.auth-and-scopes.md`, `3.modules/1.identity/1.auth/2.server.md`, `3.modules/3.features/1.events/4.reference.md` ("Staff gate for management routes"), `3.modules/3.features/4.mcp.md` ("failing policy hook"). |
| Plug-in mechanism | "registry", "virtual registry", "extension point", "hook", "source", "area", "contribute", "bootstrap provider" | `2.guide/1.concepts/1.architecture.md` (four mechanisms), `2.guide/1.concepts/3.extension-points.md` (three kinds in a table), "Source" in `3.modules/4.interface/3.menu.md`, "area" in `3.modules/4.interface/4.widget.md`. |
| Site names | "Frigear website" (7), "frigear.nu website" (4), "the website" (7), "frigear.nu" (76: product, issuer, SSO) | `1.get-started/1.introduction.md`, `4.examples/2.apps/1.frigear-nu-website.md`, `3.modules/1.identity/1.auth/index.md` ("Log in with frigear.nu"). |
| Config shape | options "under `x.settings`", "under `x`", "under `menus`" | `3.modules/1.identity/2.users.md` (`users.settings`), `3.modules/3.features/2.forms/index.md` (`forms`), `3.modules/4.interface/3.menu.md` (`menus`), `3.modules/3.features/3.cookie-consent.md` (`cookieConsent`). Auth's key is `authentication`, "not `auth`" (`1.get-started/5.authentication.md`). |
| Membership | "membership" as a label / provider / payment / account page | `3.modules/2.commerce/3.subscriptions/index.md` ("membership" is just a label) versus "membership requirements" in `3.modules/3.features/1.events/index.md` and "Membership payments" in `3.modules/2.commerce/2.payments.md`. |

Related factual contradictions about which modules install which:
- `3.modules/3.features/4.mcp.md`: the Requires note names "Events, Forms, OAuth Server and Subscriptions". Quick setup says "Events, Forms, OAuth Server, Payments and Subscriptions".
- `3.modules/5.platform/2.notify.md` lists "(`auth`, `users`, `forms`)". Its own Quick setup lists "Auth, Users, Forms and Subscriptions".

---

## 3. Concepts explained from scratch in several places

- **Module dependency chains.**
  - Pages: `3.modules/index.md` ("How they fit together") and `2.guide/1.concepts/1.architecture.md` ("How modules depend on each other").
  - They are near-verbatim bullets (Sign-in, Mobile apps, Commerce, Admin screens, Extension points), with slight wording drift.
- **The three credential kinds and the principal.**
  - Pages: `3.modules/1.identity/1.auth/index.md`, `3.modules/1.identity/1.auth/2.server.md`, `2.guide/1.concepts/2.auth-and-scopes.md`, `1.get-started/5.authentication.md` ("Who is calling") and `4.examples/3.tasks/1.protect-a-route.md`.
  - The `session` / `user-token` / `oauth` table appears in four files.
- **`sessionOnly` rule.**
  - Pages: `1.get-started/5.authentication.md`, `2.guide/1.concepts/2.auth-and-scopes.md`, `4.examples/3.tasks/1.protect-a-route.md`, `3.modules/1.identity/2.users.md`, `2.guide/3.best-practices/1.http-routes.md`.
  - Also "Never answer 404 before 401/403" in three files.
- **Staff gate and policy hook.**
  - Pages: `2.guide/1.concepts/2.auth-and-scopes.md`, `3.modules/1.identity/1.auth/2.server.md`, `2.guide/1.concepts/3.extension-points.md`, `3.modules/3.features/4.mcp.md`, `1.get-started/6.adding-modules.md` (step 3).
  - It is explained as a "gate", a "hook" and a "guard" respectively.
- **Public versus confidential clients.**
  - Pages: `2.guide/1.concepts/5.identity.md`, `2.guide/4.going-further/2.oauth-application.md`, `2.guide/4.going-further/1.own-oauth-server.md`, `3.modules/1.identity/1.auth/4.client-mode.md` (Security), `3.modules/1.identity/6.oauth-server/4.routes-and-clients.md`.
  - The OAuth application page's front-matter says it registers a client "in the admin UI or in nuxt.config, as a confidential client". Its body says config "cannot hold a confidential client".
- **OAuth roles table.** `3.modules/1.identity/1.auth/4.client-mode.md` re-introduces the Issuer / App / Resource server table that `2.guide/1.concepts/5.identity.md` already has, with different role names.
- **One app for every service.**
  - Pages: `2.guide/1.concepts/5.identity.md`, `3.modules/1.identity/6.oauth-server/2.server.md`, `3.modules/1.identity/8.oauth-resource.md`, plus pointers in `3.modules/1.identity/6.oauth-server/index.md` and `3.modules/index.md`.
- **Migrations, per-dialect schema twins and `extend.<dialect>.ts`.**
  - Pages: `1.get-started/7.database.md`, `2.guide/1.concepts/4.database-extensions.md`, `3.modules/5.platform/1.module-kit/5.database.md`, `5.contribute/3.writing-a-module/3.database-tables.md`, `5.contribute/3.writing-a-module/1.scaffold.md`.
  - The type mapping appears in prose (3 types) in Get Started and as a 7-row table in the guide.
  - "No schema changes, nothing to migrate" appears in seven files.
- **"Add a module" 5-step walkthrough (Forms).** It is verbatim in `1.get-started/6.adding-modules.md` and `4.examples/1.starters/1.workspace.md`. The Forms config block is repeated again in `4.examples/3.tasks/4.build-a-form.md`.
- **Whole sections duplicated.** "Use an existing Nuxt 4 app" is in `1.get-started/2.installation.md` and `4.examples/1.starters/1.workspace.md`. "Go to production" in the workspace starter repeats `1.get-started/8.deployment.md`.
- **Create-the-project steps, requirements and pins.**
  - Pages: `1.get-started/2.installation.md`, `4.examples/1.starters/1.workspace.md`, `4.examples/1.starters/2.mobile.md`, `4.examples/1.starters/3.mobile-standalone.md`.
  - The Node/pnpm requirements table appears in the three starter pages and in Installation. `24.22.1` appears in four files and `12.10.0` in five. `pnpm prepare:env` appears in eight files.
- **Admin sidebar groups (Overview / Manage / Settings).**
  - Pages: `3.modules/4.interface/2.admin.md`, `2.guide/1.concepts/3.extension-points.md`, `2.guide/2.ux-patterns/1.layouts-and-navigation.md`, `4.examples/3.tasks/2.add-an-admin-page.md`, `3.modules/1.identity/6.oauth-server/2.server.md`.
- **"Nuxt 4 only" note.** It is in `1.get-started/1.introduction.md`, `2.guide/1.concepts/1.architecture.md`, `3.modules/index.md` and `3.modules/5.platform/4.base-layer/index.md`.
- **The Nuxt module link.** Each module intro repeats `[Nuxt module](nuxt.com/…)`, 15 files.

---

## 4. Structural inconsistency

**Documented pattern** (`5.contribute/6.documentation.md`): intro, requirements note, `## Quick setup`, `## Options`, then `## Server`, `## App`, `## Hooks`, `## Routes`, `## Database`, `## Translations`.

**Dominant shape in practice:**
- Front-matter has `title`, `description` and optional `navigation`.
- The intro is followed by `:module-runtime{...}`.
- A `::note` starts with `**Requires**`, then `## Quick setup` and `## Options`.
- Big modules are folders with an `index.md` (`navigation.title: Overview`) and numbered sub-pages (`2.server`, `3.app`, `4.reference`). The index ends with `## On this module`.

**Deviations:**
- **Sub-page set and naming vary.**

  | Module | Sub-pages |
  |---|---|
  | Auth | server, reference, client-mode |
  | OAuth Server | server ("Helpers"), hooks, routes-and-clients |
  | Subscriptions | server, app, reference |
  | Events | server, app, reference |
  | Forms | definition, server, app, reference |
  | UI | page-components, app-shell, form-inputs, composables, reference |

  Titles read "Auth server API", "OAuth Server helpers", "Forms server", "Subscriptions server API" and "Module Kit server toolkit".
- **Hooks, routes and translations live in different places.** They are inline in Users, Payments, Cookie Consent and Preferences (Preferences has no Translations). They are on a reference sub-page in Auth, Events, Forms and Subscriptions. They are on a hooks sub-page in OAuth Server.
- **Missing or renamed sections.** Admin, Menu and Widget have no Routes or Database. Widget has no `## Options` at all. Stripe has no Translations. Stripe uses "Listening to events" and "Stripe dashboard setup". OAuth Resource uses "Not yet".
- **Extra or reordered sections.** `3.modules/3.features/3.cookie-consent.md` adds "Design" and "Types". `3.modules/4.interface/3.menu.md` adds "Vocabulary". `3.modules/3.features/4.mcp.md` has "Rules every tool follows" before Options. `3.modules/4.interface/5.mobile/index.md` has Sign-in, Tabs and Pages before App, and ends with both "On this module" and "Related".
- **Requires note differs.** `3.modules/1.identity/1.auth/index.md` has no `**Requires**` line (it says "In server mode, **requires**" inside a note). `**Optional:**` is sometimes written without the colon.
- **Intro openers differ.** "The Nuxt module that owns…" (Auth, Users), "This Nuxt module turns…" (OAuth Server, Mobile), "…as a Nuxt module" (Preferences, Notify), noun phrases (Menu, Stripe), and "`@frigear-nu/base` is a Nuxt layer" (Base Layer).
- **Front-matter and file naming.**
  - Single-file modules (14 files) have no `navigation`.
  - Base Layer adds `seo: title`.
  - Description punctuation varies: " - " in 15 module pages, ":" in others.
  - The hand-numbered prefixes skip numbers: `1.identity` has no `7.`, jumps from `6.` to `8.oauth-resource`, and the OAuth Client row in the module table has no link.
- **Closing sections differ by tab.** The closing heading is "## Next" in Get Started (7 pages) but "## Next steps" in the guide (10), examples (8) and Deployment. Modules have neither. Module pages have "On this module", "Related" or nothing.
- **Examples pages differ by kind.** All five task pages begin with "**What you'll build:**" and have "Prerequisites". The four starter and app pages have neither, and the starter pages carry their own Requirements tables.
- **Task page front-matter.** Task pages use `navigation.icon`, which module pages never do.

---

## 5. Reader orientation: no stated audience or outcome

- **`2.guide/1.concepts/*` and `2.guide/3.best-practices/1.http-routes.md`.**
  - These are written for module authors: "A module adds tools from its `setup()`", "Register every route from one table in `module.ts`". They are filed under a Guide that `1.get-started/1.introduction.md` describes as "Understand the concepts".
  - No page says "for module authors" or what the reader can do afterwards.
- **`4.examples/3.tasks/2.add-an-admin-page.md`.**
  - It promises "a `/admin/events`-style list page in your app".
  - Step 2 requires `src/module.ts` and `setup()`, and the workspace starter has no module of its own.
  - `4.examples/3.tasks/1.protect-a-route.md` mixes in the same module-author step.
- **`1.get-started/3.project-structure.md` and `1.get-started/4.configuration.md`.** They open directly with content, and no sentence says what you will be able to do afterwards.
- **13 of 23 module overview pages lack a "Use it when…" sentence.** These are Auth, Users, Account, Authorization, Preferences, OAuth Server, OAuth Resource, Stripe, Payments, Subscriptions, Forms, Email Templates and Base Layer.
- **Sub-pages open on a bare section heading or table.**
  - `3.modules/3.features/2.forms/4.app.md` starts with `## Pages`.
  - `3.modules/3.features/1.events/4.reference.md` and `3.modules/2.commerce/3.subscriptions/4.reference.md` start with `## Hooks`.
  - `3.modules/4.interface/1.ui/6.reference.md` starts with `## Subpath exports`.
  - They have no intro, and some do not say which Auth mode they cover.
- **`4.examples/1.starters/*` and `4.examples/2.apps/1.frigear-nu-website.md`.** None has "What you'll build".
- **`2.guide/2.ux-patterns/4.text-and-formatting.md`.** It opens "Text and formatting conventions apply to every string", with no audience.
- **`3.modules/5.platform/1.module-kit/*`.** Whether you are an app developer or a module author is never said.

---

## 6. Worst five for length and density

Word counts include code. The corpus total is 98,614 words.

| # | Page | Words | Evidence |
|---|---|---|---|
| 1 | `3.modules/1.identity/1.auth/4.client-mode.md` | 3,235 | About 333 words before Quick setup. A 423-word single bullet block in Security. 70-word table cells. 12 subsections. |
| 2 | `3.modules/1.identity/2.users.md` | 2,588 | 14 subsections. The `admin` option cell is about 74 words. |
| 3 | `3.modules/1.identity/6.oauth-server/4.routes-and-clients.md` | 2,384 | A 314-word bullet block in "Configured clients". Six sentences over 35 words. |
| 4 | `3.modules/1.identity/1.auth/index.md` | 2,264 | About 316 words (two tables and a note) before Quick setup. A 242-word list in "Log in with frigear.nu". |
| 5 | `3.modules/5.platform/1.module-kit/5.database.md` | 2,247 | Includes a deprecated section, "Advanced (deprecated): `factory`". Covers registration, parity, extension and migrations in one page. |

Runners-up:
- `4.examples/1.starters/2.mobile.md`, 2,197.
- `2.guide/4.going-further/2.oauth-application.md`, 2,068.
- `3.modules/4.interface/1.ui/5.composables.md`, 1,952, of which 937 are code.
- `3.modules/1.identity/3.account.md`, 1,917, with nine sentences over 35 words.
- `3.modules/3.features/4.mcp.md`, with a 252-word rules block.
- `3.modules/4.interface/1.ui/2.page-components.md`, with a 99-word table cell.

---

## 7. Jargon before definition, and API names where a plain phrase would do

**Used undefined, or defined long after first use:**
- "Nitro plugin" and "session mapper" in `1.get-started/3.project-structure.md`. "Nitro" is never glossed in Get Started.
- "ACL" in `NUXT_ACL_ADMINS` and `acl.ts`. It is never expanded anywhere.
- "NuxtHub", "Drizzle" and "libsql" in `1.get-started/2.installation.md` and `1.get-started/7.database.md`, with no explanation.
- "principal", in `1.get-started/5.authentication.md`.
- "scopes" in `1.get-started/5.authentication.md`.
- "issuer" in `1.get-started/2.installation.md`.
- "PKCE" is used in 12 files and spelled out once, in `2.guide/4.going-further/1.own-oauth-server.md` (as a form field label).
- Also unexplained: "JWKS", "RS256" and RFC numbers (`RFC 9207`, `RFC 9068`, `RFC 8414`) in the OAuth pages. "SPA" (16 uses) and "PII" (`*:pii`, `3.modules/3.features/4.mcp.md`) are not expanded either.
- "fixture" in user-facing module pages (see section 2).
- "virtual module" and "registry" in `2.guide/1.concepts/1.architecture.md` and `3.extension-points.md`. "Virtual" is explained as "no runtime scanning", not as a concept.
- "moduleDependencies" in `3.modules/index.md`.

**Code names standing in for plain phrases:**
- `3.modules/index.md`: "install what they need through `moduleDependencies`".
- `2.guide/1.concepts/1.architecture.md`: "reaches users only through the `AuthUserStore` that `users` registers". Elsewhere: "A module calls `extendMenu`, `extendWidgets`, `extendTabs`, `addAuthScope` or `addMcpDefinitions`" (4 helper names in 1 sentence).
- `2.guide/1.concepts/2.auth-and-scopes.md`: "`defineStaffGuard` combines them, one per module".
- `1.get-started/5.authentication.md`: "`requireAuth` ... Use it instead of nuxt-auth-utils' `requireUserSession`". It also uses "`definePageMeta`, which replaces the matching route rules".
- `1.get-started/3.project-structure.md`: "`effectiveRole()`: the stored role".
- `2.guide/2.ux-patterns/2.pages.md`: component names in nearly every bullet (`PageHeading`, `PageToolbar`, `TableCard`, `TableIdentity`, `RowMenu`, `StatusBadge`, `emptyCell()`), with no pictures.
- `3.modules/4.interface/1.ui/2.page-components.md`: "none is a global component: a global component is bundled into the app entry".
