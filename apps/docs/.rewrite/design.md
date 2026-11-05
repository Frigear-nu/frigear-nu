<!-- Working notes for the docs rewrite (generated 2026-11-05). Deleted in the final rewrite PR. -->

# Phase 0 design: vocabulary, page templates, style guide and link checker

**Findings that change the plan:**
- **CI never runs on docs-only PRs.** `.github/workflows/ci.yml` has `paths-ignore: '**/*.md'`, so adding a `lint` script to `apps/docs` alone would never fire for content edits (see D).
- **Heading anchors are not plain GitHub slugs.** `@nuxtjs/mdc` (`dist/runtime/parser/compiler.js`) runs `github-slugger`, then collapses `-+`, trims leading and trailing `-`, and prefixes a leading digit with `_`. The task-page heading `## 1. Require a signed-in user` becomes `#_1-require-a-signed-in-user`.
- **The code already calls the concept "staff".** `packages/auth/src/runtime/server/utils/policy.ts` describes `definePolicyGate` as "A staff gate decided by the host through a Nitro hook, denied by default".
- **The UI says "Sign in" and "Sign up"** (`packages/auth/src/runtime/i18n/lang/en.json`). The routes are `/login` and `/register`.
- **The Forms page contradicts its own table.** It says "All options live under `forms`" while every row is `settings.*`. Users says "under `users.settings`" and lists bare names.
- **The closing heading has four names:** `## Next steps` ×20, `## On this module` ×10, `## Next` ×7, `## Related` ×2.
- **Only one external deep link carries an anchor:** `docs.frigear.dev/modules/identity/account#translations`. `package.json` homepages and starter files link to routes only.
- **"Playground" is not a fixture.** It is a dev app at `packages/<name>/playground`, so it stays as its own term.

---

## A. Glossary

New page `apps/docs/content/2.guide/1.concepts/6.glossary.md`, route `/guide/concepts/glossary`. This adds a file and renames nothing.

| Term | Meaning | Owner page route | Replaces |
|---|---|---|---|
| **host app** | The Nuxt app that installs Frigear modules and configures them. Pages that speak to the app developer may say "your app". | /guide/concepts/architecture | host application, consuming app/application, consumer, the application, bare "the host" |
| **hosting platform** | Where you deploy the host app (Cloudflare, Vercel, a Node server). | /get-started/deployment | "host" meaning the platform in 8.deployment ("the host's environment") |
| **staff** | People your host app lets into management screens and APIs. Modules never decide who is staff; your app does, in a policy hook. | /guide/concepts/auth-and-scopes | admins (as people), back office users, privileged users |
| **admin area** | The screens under `/admin`, drawn by the [Admin](/modules/interface/admin) module. | /modules/interface/admin | back office, admin shell (in prose), admin UI, user admin (use "user management in the admin area") |
| `admin` **role** | A value of the `role` column from Authorization. It is only a role name and not a synonym for staff. | /modules/identity/authorization | "admin" meaning staff |
| **policy hook** | A Nitro hook named `<module>:authorize` (for example `events:authorize`) that your app answers to allow an action. It is denied by default. | /guide/concepts/auth-and-scopes#policy-gates | policy gate (keep only as the function name `definePolicyGate`), host policy, staff gate, `*:authorize` hook |
| **staff guard** | For module authors: one helper (`defineStaffGuard`) that checks sign-in, the module's staff scope and its policy hook. | /modules/identity/auth/server#staff-guards | staff gate, role guard (on the server) |
| **guard** / **route rule** | Authorization's checks before a page or route runs, by role or ability. In client mode they only shape the UI; the API decides. | /modules/identity/authorization | page guard, role guard |
| **principal** | Who made a request: the signed-in user, how they proved it (session, API token or access token) and the scopes that proof carries. In code it is `AuthPrincipal`. | /guide/concepts/auth-and-scopes#the-principal | caller, actor, authenticated user (as an object) |
| **signed-in user** | The person behind a principal, when only the person matters. | /guide/concepts/auth-and-scopes | user (when ambiguous), logged-in user |
| **visitor** | Someone with no valid credential. | /guide/concepts/auth-and-scopes | guest, anonymous (keep only in code names such as "Anonymous paths") |
| **issuer** | The server where users sign in and which issues tokens to other apps. Frigear's issuer is the OAuth Server module. | /guide/concepts/identity#the-roles | OAuth server (lowercase generic), identity provider, the provider, Frigear OAuth server |
| **OAuth Server** | The module that turns a host app into an issuer. Always capitalised and linked. | /modules/identity/oauth-server | OAuth Server used for any issuer |
| **OAuth provider** | A third-party sign-in service Auth supports through nuxt-auth-utils (GitHub, Google, Auth0, `oidc`). | /modules/identity/auth#oauth-providers | "provider" meaning the issuer |
| **OAuth application** | An app registered at an issuer so its users can sign in through it. Stored in `oauth_applications`. | /modules/identity/oauth-server/routes-and-clients | OAuth client, client (bare), application (bare, when ambiguous) |
| **public / confidential** (application type) | Confidential: a server that keeps a client secret. Public: a browser or device app with no secret, protected by PKCE. Fixed when the application is created. | /guide/concepts/identity#confidential-and-public-clients | public client and confidential client (as nouns), public application |
| **configured client** | A public OAuth application defined in the `clients` config instead of the admin area. | /modules/identity/oauth-server/routes-and-clients#configured-clients | config client, static client |
| **test fixture** | A minimal Nuxt app under `test/fixtures/` that installs a module from source so tests can boot it. | /contribute/writing-a-module/testing | fixture (bare), fixture app, test app |
| **playground** | A dev app under `packages/<name>/playground` for `pnpm dev` while working on one package. | /contribute/writing-a-module/scaffold | (not a fixture; never use as a synonym) |
| **module** | A Nuxt module published as `@frigear-nu/<name>` that adds one feature to a host app. | /modules | extension, building block, Nuxt module (after first mention) |
| **package** | Any npm package in the repository. Use it for install and publish steps and for tooling that is not a module (CLI, ESLint config). | /guide/concepts/architecture | package meaning module, outside install and publish contexts |
| **base layer** | `@frigear-nu/base`, a Nuxt layer the host app extends for shared config, UI defaults and content pages. | /modules/platform/base-layer | layer (bare), "layer" meaning an architecture level (say "depends on" or "sits below") |
| **Frigear repository** | This monorepo (`Frigear-nu/frigear-nu`). | /contribute/overview | the workspace (meaning the monorepo), monorepo |
| **starter** | A template project in `.starters/` that you copy to start a new host app, for example the workspace starter. | /get-started/installation | template, boilerplate |
| **your workspace** | The pnpm workspace a starter creates for you. | /get-started/project-structure | workspace (bare, when ambiguous) |
| **sign in / sign-in** | Verb "sign in"; noun or adjective "sign-in". The same pattern applies to sign up / sign-up and sign out. Route paths `/login` and `/register` stay as code. | /get-started/authentication | log in, login (prose), register (verb in prose), Create account (except quoting the UI), Log in with frigear.nu |
| **Sign in with frigear.nu** | Auth's built-in sign-in against frigear.nu for previews and local development (`oauth.frigear`). | /modules/identity/auth#sign-in-with-frigearnu (anchor changes in Phase 3) | Log in with frigear.nu, frigear SSO |
| **server mode** | Auth signs users in on the host app's own server and keeps them in a cookie session. This is the default. | /modules/identity/auth | server-rendered mode, confidential mode |
| **client mode** | Auth for an app without its own server (SPA or Capacitor): it signs in at an issuer with PKCE and keeps the tokens. | /modules/identity/auth/client-mode | SPA mode, public client mode |
| **extension point** | A place where one module adds things to another without importing it. There are two kinds: registries and hooks. | /guide/concepts/extension-points | plug-in point, contribution point |
| **registry** | A build-time list modules add entries to (menus, widgets, tabs, scopes, MCP tools). The owner bundles it into a virtual module. | /guide/concepts/extension-points | virtual registry, source; the verb "contribute" (say "add to") |
| **hook** | A Nitro runtime hook. A module calls it, and listeners in the host app or other modules answer. | /guide/concepts/extension-points | event (when it means a hook) |
| **widget area** | A named slot where the Widget module renders the components modules add. | /modules/interface/widget | area (bare) |
| **frigear.nu** | The live Frigear service, which is also the default issuer. | /examples/apps/frigear-nu-website | Frigear SSO, the website (meaning the service) |
| **Frigear website app** | The reference host app in `apps/website` that runs frigear.nu. | /examples/apps/frigear-nu-website | the website, frigear.nu website, Frigear website |
| **options** (config shape) | Module options sit under the module's config key in `nuxt.config.ts`. Option tables show the full path from that key (`settings.pages.admin`). | /contribute/documentation#writing | "under x.settings" lead sentences |
| **session** | A sealed cookie that keeps a person signed in to one host app in server mode. It carries every scope. | /guide/concepts/auth-and-scopes#the-principal | cookie session (fine as a first-mention gloss) |
| **API token** | A long-lived token a user creates on their account page for scripts or MCP clients. It starts with `fnu_`, and the code kind is `user-token`. | /modules/identity/auth/server#user-api-tokens | user API token, user token, personal token |
| **access token** | A short-lived signed token (JWT) an issuer gives an OAuth application for a signed-in user. | /guide/concepts/auth-and-scopes#the-principal | OAuth token, bearer JWT |
| **scope** | A `resource:action` permission string (`tickets:read`) that limits what a token may do. | /guide/concepts/auth-and-scopes#scopes | permission (meaning a scope) |
| **migration** | A generated SQL file that changes the database schema. You generate and commit one whenever a module adds or changes tables. | /get-started/database#migrations | schema change file |
| **dialect** | The database type a schema is written for: SQLite or PostgreSQL. | /get-started/database#sqlite-and-postgresql | driver (meaning dialect) |
| **Nitro** | Nuxt's server engine, where server routes, server plugins and hooks run. | /guide/concepts/glossary | server runtime |
| **NuxtHub** | `@nuxthub/core`, the module that provides the database (and blob storage) to the host app. | /get-started/database | hub |
| **Drizzle** | The TypeScript ORM modules use to define tables and generate migrations. | /modules/platform/module-kit/database | drizzle-orm (in prose) |
| **PKCE** | Proof Key for Code Exchange: a one-time secret that proves the app that started a sign-in is the app that finishes it. | /guide/concepts/identity | (expand on first use) |
| **SPA** | Single-page application: a browser app with no server of its own. | /guide/concepts/identity | (expand on first use) |
| **JWKS** | JSON Web Key Set: the public keys an issuer publishes at `/.well-known/jwks.json` so others can verify its tokens. | /guide/going-further/signing-keys | (expand on first use) |
| **PII** | Personally identifiable information. `resource:pii` scopes guard it, and wildcards never include them. | /guide/concepts/auth-and-scopes#scopes | personal data scope (fine as a gloss) |
| **ACL** | Access control list. In the starter, `NUXT_ACL_ADMINS` lists emails that always get the `admin` role. | /get-started/authentication#roles-and-the-first-admin | (expand on first use) |

**Rule for code names:** the reader-facing word comes first, then the code name once in backticks, for example "staff (people your app allows through `users:admin:authorize`)". Never put a code name in a heading when a plain word exists. Keep `Staff guards` as a heading only on module-author pages.

---

## B. Page templates

### B1. Module overview (`index.md` of a folder, or a single-file module)

Front matter `description` says what the module is for in one sentence, not a feature list.

| Order | Heading | Contents |
|---|---|---|
| 1 | *(no heading)* | 2–4 plain sentences: what it does for the host app and its users, when to use it, and when to use something else (one link). No package name before sentence 2. |
| 2 | `## What you get` | Bullets in reader terms, grouped: **Pages** (paths), **Admin area** (screens), **Server routes**, **Composables and helpers**, **Emails**. Mark each as on by default or opt-in. |
| 3 | `:module-runtime{…}` | Badge row, unchanged component. |
| 4 | `::note` (requires) | Fixed three lines: **Installed for you:** … **You add:** … **Optional:** … Nothing else goes in this note. A config-key gotcha such as "`authentication`, not `auth`" goes in its own `::warning` in Quick setup. |
| 5 | `## Quick setup` | `::steps`: (1) install, (2) `nuxt.config.ts`, (3) migration if it adds tables, with a `::warning` before it, (4) answer its policy hooks if any, with a `::warning` before it ("without this nobody can …"). End with a "What you should see" success callout. |
| 6 | `## Options` | Lead: "Options go under the `x` key in `nuxt.config.ts`." Table: option (full path from the key), type, default, purpose. Long explanations go below as **`option`** bold-lead paragraphs. Runtime config and environment variables go under `### Runtime config`. |
| 7a | Single-file modules | `## Server`, `## App`, `## Hooks`, `## Routes`, `## Database`, `## Translations`, in that order. Each opens with one sentence (see B2). Single-file modules keep everything inline; a split needs a move, which is out of scope. |
| 7b | Folder modules | `## Module pages`: a table of page, what it covers, who it is for or which auth mode. It replaces `## On this module` and sits after Options. |
| 8 | `## Next steps` | See B6. |

**Standard sub-page roles.** Files are not renamed; set the role through `navigation.title` and the intro only.

| Role | Nav title | Section order |
|---|---|---|
| Overview (`index.md`) | Overview | B1 |
| Server | Server API | One H2 per job (protect a route, define scopes …) |
| App | App | Pages, Components, Composables, Utils |
| Reference | Reference | Hooks, Routes, Database, Translations (move any App section to the top, or to the App page if one exists) |
| Topic | Its own name | Any task-shaped page (client-mode, definition, hooks, routes-and-clients, the UI sub-pages) |

How existing folders map:

| Module | Mapping |
|---|---|
| auth | 2.server = Server, 3.reference = Reference, 4.client-mode = Topic |
| oauth-server | 2.server = Server (nav title "Helpers" → "Server API"), 3.hooks = Topic "Policy hooks", 4.routes-and-clients = Reference (Routes, Database and Translations stay last) |
| forms | 2.definition = Topic, 3.server, 4.app, 5.reference |
| ui | All five pages are Topics plus 6.reference |
| events, subscriptions | 2.server, 3.app, 4.reference |

### B2. Module sub-page

- **Opening paragraph (no heading), 1–2 sentences:** what this page covers, who it is for (app developer or module author), and which auth mode it applies to ("Server mode only", "Both modes"). Then: "Set up the module first: [Overview](…)."
- **H2s in the role order above.** Every H2 opens with one sentence before any table or code.
  - Hooks: "Your app answers these Nitro hooks from a server plugin (`server/plugins/*.ts`)."
  - Routes: "Routes the module registers, and who may call them."
  - Database: "Tables the module adds. Generate and commit a [migration](…) after installing."
  - Translations: "Override any string in your app's `i18n/locales/<code>.json`."
- **Closing:** `## Next steps`.

### B3. Concept page (`2.guide/1.concepts/*`)

| Order | Heading | Contents |
|---|---|---|
| 1 | *(no heading)* | The problem in 1–2 sentences, then "After this page you can decide …". |
| 2 | `::callout{icon="i-lucide-users"}` | **For:** app developers / module authors (one line). |
| 3 | `## Which one do I use?` | Table: you are building / use / link. It comes before any mechanism. |
| 4 | `## Terms` | 3–6 bullets, each a glossary term this page owns, defined in one sentence. |
| 5 | `## How it works` | Mechanism. H3 per mechanism; a diagram (text block) where flows cross apps. |
| 6 | `## Common mistakes` (optional) | One `::warning` per mistake, each saying what breaks. |
| 7 | `## Next steps` | See B6. |

### B4. Task page (`4.examples/3.tasks/*`)

| Order | Heading | Contents |
|---|---|---|
| 1 | `**What you'll build:**` (bold lead, existing) | 1–2 sentences. |
| 2 | `## Prerequisites` | Links only, no re-explanations. Toolchain: "See [Requirements](/get-started/installation#requirements)." |
| 3 | `## 1. …` `## 2. …` | Numbered H2 per step, existing style. Each step: one sentence of why, then code. `::warning` goes before the step it protects, and `::caution` before irreversible or security-relevant steps. |
| 4 | Success callout | `::callout{color="success" icon="i-lucide-check"}` **What you should see:** observable result (URL, status code, screen). |
| 5 | `## Troubleshooting` (optional) | Table: symptom / cause / fix. |
| 6 | `## Next steps` | See B6. |

Numbered headings get `_1-…` anchors. Link to them only through the checker-verified form.

### B5. Starter page and get-started page

| Order | Heading | Contents |
|---|---|---|
| 1 | `**What you'll have afterwards:**` | Bold lead plus 1–3 bullets (running app, signed in as staff, which screens). |
| 2 | `## Prerequisites` | Link to `/get-started/installation#requirements`. List only extra tools here (Xcode, Android Studio, a CocoaPods row). |
| 3 | Numbered steps | As B4, with the success callout after the run step. |
| 4 | `## What is in the starter` | Starter pages only: a table of path / what it does. |
| 5 | `## Next steps` | See B6. |

The requirements table exists only in `/get-started/installation`. `/contribute/local-development` keeps a table only for tools beyond those (repo-specific) and links for Node and pnpm.

### B6. Closing section (every page)

- **Heading:** always `## Next steps`. Replace `## Next`, `## Related` and the closing `## On this module`.
- **At most four links.** Each is a bullet "[Page](/route) – why you would go there now", one sentence.
- **Order:** the most likely next action first. No links back to pages already linked in the intro.

---

## C. Style guide outline (rewrite of `5.contribute/6.documentation.md`)

Keep the existing sections as they are: Where a page belongs, Add or update a page, the Conventions bullets (titles, code and reference, accuracy, Nuxt 4, link by route, starters) and the redirects rule. Then make these changes:

- **Conventions → Module page layout:** replace the order bullet with "Use the templates below".
- **Add `## Page templates`:** B1–B6 in one `::tabs`, one tab per template.
- **Add `## Vocabulary`:** one paragraph and a link to `/guide/concepts/glossary`.
- **Add `## Check links`:** see D.

### `## Writing`

| Rule | Bad (current docs) | Good |
|---|---|---|
| Reader first: the first screen answers what it is, who it is for and what you get; code names come after | auth index opens "The Nuxt module that owns **authentication**: …" | "Lets people sign in to your app with a password, an emailed link, a passkey or GitHub/Google, and tells every server route who is calling." |
| One fact per sentence | "Only the SHA-256 is stored, and they are accepted in the `Authorization` header only." | "Only a hash of the token is stored. Send it in the `Authorization` header." |
| Inline code at most once per sentence; no code name before its plain explanation | "A caller is one of three kinds, all resolved into the same `AuthPrincipal`" | "Auth works out who made the request and how they proved it. It hands your route that answer, the principal (`AuthPrincipal`)." |
| Expand acronyms on first use per page | "PKCE sign-in for SPAs and Capacitor apps" | "sign-in with PKCE (Proof Key for Code Exchange) for single-page apps (SPAs) and Capacitor apps" |
| Link the glossary term on first use per page | first "staff" with no link | "[staff](/guide/concepts/glossary)" on first use, plain afterwards |
| Never two names for one concept | "OAuth client" and "application" on the same page | "OAuth application" throughout |
| Procedures are numbered, in execution order, with prerequisites before step 1 | oauth-server "Then: 1. … 3. Implement the hooks. Without them nobody is an admin." | `::warning` "Without these hooks no one can manage applications" placed before step 3 |
| `::warning` before the step it protects, never after | auth index: the migration `::warning` follows the config block | Migration is its own step with the warning first |
| `::caution` for irreversible or security-relevant steps | key rotation, `sessionOnly` choices written as plain prose | `::caution` "Use a different signing key per environment." |
| Table cells hold one fact, under ~25 words | `afterLogin` purpose cell (~45 words) | Cell "Where users land after signing in." plus a **`afterLogin`** paragraph below |
| No wall of prose | auth/index `settings` paragraphs after the table run 3 paragraphs with no break | At most ~6 paragraphs between a table, callout or code block |

**Callout mapping** (most pages carry several):

| Callout | Use for |
|---|---|
| `::note` | Background needed for the next step |
| `::tip` | A recommendation or the shortest path |
| `::warning` | What breaks if this is skipped; placed before the step |
| `::caution` | Irreversible or security-relevant |
| `::callout{color="success" icon="i-lucide-check"}` | **What you should see** after a procedure |

**Options rule:** the lead sentence is always "Options go under the `x` key". The table shows the full path from that key. Fix Users (bare names under a `users.settings` lead) and Forms (`settings.*` rows under a `forms` lead).

### `### Define once, link everywhere`

Other pages give one sentence and a link to the keeper.

| Duplicate | Where it appears | Keeper (full text) |
|---|---|---|
| Dependency chains | 3.modules/index.md, 2.guide/1.concepts/1.architecture.md | `/modules#how-they-fit-together`. Architecture keeps only the "dependencies point one way" rule. |
| Credential-kinds table | auth/index.md, auth/2.server.md, tasks/1.protect-a-route.md, concepts/2.auth-and-scopes.md | `/guide/concepts/auth-and-scopes#the-principal` |
| `sessionOnly` rule | get-started/5.authentication, identity/2.users, auth/2.server, tasks/1.protect-a-route, tasks/5.send-an-email, concepts/2.auth-and-scopes, best-practices/1.http-routes | `/guide/concepts/auth-and-scopes#sessiononly` |
| "Nuxt 4 only" note | get-started/1.introduction, 3.modules/index, concepts/1.architecture, base-layer/index, contribute/1.overview (6.documentation keeps the writer rule) | `/get-started/introduction` (one `::note`) |
| Add-a-module walkthrough | get-started/6.adding-modules, starters/1.workspace | `/get-started/adding-modules#add-a-module` |
| Requirements table | get-started/2.installation, starters/2.mobile, starters/3.mobile-standalone, contribute/2.local-development | `/get-started/installation#requirements` (others list extra tools only) |
| Public vs confidential | concepts/5.identity, oauth-server/2.server, oauth-server/4.routes-and-clients, auth/4.client-mode, starters/3.mobile-standalone, going-further/1.own-oauth-server, going-further/2.oauth-application | Concept: `/guide/concepts/identity#confidential-and-public-clients`. Mechanics (CORS, native redirect URIs): `/modules/identity/oauth-server/routes-and-clients#public-clients` |
| Migrations / dialect | get-started/7.database, 1.get-started/4.configuration, module-kit/5.database, contribute/writing-a-module/3.database-tables, concepts/4.database-extensions (plus mentions in about 15 other pages) | App developer: `/get-started/database`. Module author: `/modules/platform/module-kit/database`. Extending tables: `/guide/concepts/database-extensions`. |

### `### Pictures`

- **Recommendation:** Phase 2 adds screenshots, not ASCII or mermaid sketches. There is precedent in `apps/docs/public/images/email-templates/*.png`.
- **Why:** ASCII cannot show the layouts these pages describe (sidebar, ⌘K palette, settings grid, slideovers). Mermaid shows flows, not layouts.
- **Scope:** about 10 images in `apps/docs/public/images/ux-patterns/`, named `<page>-<pattern>.png`:
  - 3 areas (public, admin area, account)
  - list, detail and empty state
  - create slideover, destructive confirm, row actions
- **Capture:** from the `apps/website` dev server with seeded data and a staff account; light theme, 1440 px wide, cropped to the pattern; alt text describes the layout.
- **Cost:** about 1 day. Images go stale when the UI changes, so a reviewer recaptures them when a `packages/ui` or `packages/admin` layout PR changes them.
- **Diagrams:** keep text-block diagrams for flows (identity, OAuth sign-in).

---

## D. `scripts/docs-check-links.mjs` (zero dependencies, Node ≥ 24)

**Routes.** Walk `apps/docs/content/**/*.md`:
- Strip `^\d+\.` from each segment and drop `.md`.
- `index.md` maps to its folder route; the root `index.md` maps to `/`.
- Skip `.navigation.yml`.

**Anchors.** For each file, collect headings and assign ids:
- Ignore fenced code: track ```` ``` ```` and `~~~` fences, including fences inside `::code-group` and `::tabs`.
- Text: strip inline markdown (backticks, `[t](u)` → `t`, `*`/`_`), lowercase.
- Remove characters not matching `[\p{L}\p{N}\p{M}\p{Pc} -]/u` (the `github-slugger` rule), then spaces → `-`.
- Deduplicate per page with `-1`, `-2`, as `github-slugger` does.
- Then apply mdc's post-steps: `.replace(/-+/g,'-').replace(/^-|-$/g,'').replace(/^(\d)/,'_$1')`.
- Honour explicit `{#id}`.

**Links.** Outside code fences and inline code:
- Markdown links `](/…)` and `](#…)`.
- MDC props `to="/…"`, `to: /…` and `href`.
- Skip `http(s):`, `mailto:` and `/llms.txt`.
- `/images/…` must exist under `apps/docs/public`.
- Strip query strings.

**Redirects.** Read `apps/docs/nuxt.config.ts` with a regex for `"from": "to"` pairs:
- A link to a redirect source is a **warning** ("use the new route").
- A redirect target that resolves to no route is an **error**.

**External references** (catch route-breaking edits). Scan `packages/*/package.json` `homepage`, `packages/*/README.md`, `.starters/**/AGENTS.md`, `README.md` and `AGENTS.md` for `docs.frigear.dev/…` URLs and resolve them the same way. Today that includes `/modules/identity/account#translations`.

**Glossary.** Parse the table in `2.guide/1.concepts/6.glossary.md`. Every "Owner page route" (with any `#anchor`) must resolve.

**Opt-in `--terms [folder]`.** Report-only:
- Search non-code text for the "Replaces" variants (case-insensitive, word boundaries), counted per file.
- It never fails the run in Phase 0. Each later phase adds `--terms <its folders> --strict` to the workflow once its folder is clean.

**Output.** `path:line  <link>  <reason>`, then a summary. Exit 1 on any error; warnings do not fail.

**Wiring:**
1. `apps/docs/package.json`: `"lint": "node ../../scripts/docs-check-links.mjs"`. Turbo's existing `lint` task picks it up locally and in `ci.yml` when non-`.md` docs files change. This avoids a new turbo task; `check` would need a `turbo.json` entry.
2. Root `package.json`: `"docs:check": "node scripts/docs-check-links.mjs"`.
3. New `.github/workflows/docs.yml`, needed because `ci.yml` has `paths-ignore: '**/*.md'`:
   - Trigger: `pull_request` with `paths: ['apps/docs/**', 'scripts/docs-check-links.mjs', 'packages/*/package.json', 'packages/*/README.md', '.starters/**/AGENTS.md']`.
   - Steps: checkout, `actions/setup-node` with `.nvmrc`, `node scripts/docs-check-links.mjs`.
   - No pnpm install, so it runs in about 15 s and fits the CI-budget rules in AGENTS.md "CI".
4. `6.documentation.md`, step 5 of "Add or update a page": "Run `pnpm docs:check`."

---

## E. Phase ordering

Reordered. Counts are measured with `wc -w`, front matter included.

| Phase | Scope | Pages | Words | Reason |
|---|---|---|---|---|
| 0 | Glossary page, 6.documentation.md, link checker, docs.yml | 2 + script | ~3k new | Vocabulary before prose |
| 1 | `index.md`, 1.get-started/*, 2.guide/1.concepts/*, **4.examples/1.starters/*** (moved up) | 17 | ~15.4k | Starters are where Installation sends readers. They hold two duplicates to collapse (add-a-module, requirements). Concepts own most glossary terms. |
| 2 | 2.guide/2.ux-patterns, 3.best-practices, 4.going-further, 4.examples/3.tasks, plus screenshots | 14 | ~12.3k | Unchanged. Tasks link to module pages by route, so they do not wait on module rewrites. |
| 3 | 3.modules/index.md + 1.identity/** | 14 | ~23.5k | Largest and most cross-linked. It owns principal, issuer, OAuth application, server/client mode. Heading renames here ("Log in with frigear.nu", "On this module") break anchors, which the checker catches. |
| 4 | 2.commerce, 3.features, 4.interface | 28 | ~28.6k | Same module template; split into 4a (commerce + features, 17 pages / 17.1k) and 4b (interface, 11 pages / 11.5k) if one PR is too big to review. |
| 5 | **5.platform/**** (moved from 3), 4.examples/2.apps, 5.contribute | 26 | ~18.8k | Platform (module-kit, email-templates, base-layer, notify) is mostly for module authors and shares the migrations/dialect duplicates with contribute/writing-a-module, so both are rewritten together. |

Totals: about 99 content pages and about 99k words, the same as the audit (get-started 4.5k + guide 14.8k + modules 63.7k + examples 8.7k + contribute 6.2k + root index about 0.6k).

---

### Files read

Docs content:
- apps/docs/content/5.contribute/6.documentation.md
- apps/docs/content/3.modules/index.md
- apps/docs/content/2.guide/1.concepts/1.architecture.md
- apps/docs/content/2.guide/1.concepts/2.auth-and-scopes.md
- apps/docs/content/2.guide/1.concepts/5.identity.md
- apps/docs/content/3.modules/1.identity/1.auth/index.md
- apps/docs/content/3.modules/1.identity/6.oauth-server/index.md (to Options)
- apps/docs/content/3.modules/1.identity/2.users.md (to Options)
- apps/docs/content/1.get-started/2.installation.md (top)
- apps/docs/content/4.examples/3.tasks/1.protect-a-route.md (top)
- apps/docs/content/2.guide/2.ux-patterns/1.layouts-and-navigation.md (top)
- apps/docs/content/5.contribute/3.writing-a-module/4.testing.md (top)
- apps/docs/content/3.modules/3.features/2.forms/index.md (Options)
- Openings only: apps/docs/content/3.modules/1.identity/1.auth/2.server.md, apps/docs/content/3.modules/1.identity/1.auth/3.reference.md, apps/docs/content/3.modules/1.identity/6.oauth-server/2.server.md, apps/docs/content/3.modules/1.identity/6.oauth-server/3.hooks.md, apps/docs/content/3.modules/3.features/2.forms/5.reference.md, apps/docs/content/3.modules/1.identity/8.oauth-resource.md

Config and code:
- apps/docs/package.json
- apps/docs/nuxt.config.ts
- apps/docs/app/components/content/ModuleRuntime.vue
- .github/workflows/ci.yml
- .github/workflows/deploy-preview.yml (top)
- turbo.json
- package.json (scripts)
- AGENTS.md (CI section)
- packages/auth/src/runtime/server/utils/policy.ts
- packages/auth/src/runtime/i18n/lang/en.json (greps)
- packages/oauth-server/src/types.ts and packages/oauth-server/src/module.ts (greps)
- packages/authorization/src/module.ts (greps)
- packages/forms/src/module.ts (greps)
- @nuxtjs/mdc `dist/runtime/parser/compiler.js` (slug logic)

I also grepped every file under `apps/docs/content` for headings, duplicates, terms and word counts.

### Critical Files for Implementation
- /Users/kristianhareland/Workspace/frigear-oss/frigear-nu/.claude/worktrees/docs-clarity-consistency-48a86d/apps/docs/content/5.contribute/6.documentation.md
- /Users/kristianhareland/Workspace/frigear-oss/frigear-nu/.claude/worktrees/docs-clarity-consistency-48a86d/apps/docs/content/2.guide/1.concepts/6.glossary.md (new)
- /Users/kristianhareland/Workspace/frigear-oss/frigear-nu/.claude/worktrees/docs-clarity-consistency-48a86d/scripts/docs-check-links.mjs (new)
- /Users/kristianhareland/Workspace/frigear-oss/frigear-nu/.claude/worktrees/docs-clarity-consistency-48a86d/apps/docs/package.json
- /Users/kristianhareland/Workspace/frigear-oss/frigear-nu/.claude/worktrees/docs-clarity-consistency-48a86d/.github/workflows/docs.yml (new; ci.yml skips `**/*.md`)
