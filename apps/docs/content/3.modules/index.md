---
title: Modules
description: Which Frigear module gives your app each feature, what each one does and which others it installs for you.
---

Each module adds one feature to your app, such as sign-in, payments or forms. This page helps you pick the modules
for what you want to build. It also shows which other modules each one installs, so you know what you end up with.

A [module](/guide/concepts/glossary) is a [Nuxt module](https://nuxt.com/docs/4.x/guide/modules) published as
`@frigear-nu/<name>`. You add it to `nuxt.config.ts` and set its options. The modules are Nuxt 4 only, as
[Introduction](/get-started/introduction) explains.

::tip
New to the modules? The [workspace starter](/examples/starters/workspace) gives you a running app with sign-in, account
pages and an [admin area](/guide/concepts/glossary) already wired up.
::

## Which module do I need?

Find what you want to build, then add the module in the second column. It installs the modules it depends on, so you
rarely add more than one at a time. Module Kit is left out of the last column, since nearly every module installs it.

| You want to | Add | It also installs |
| --- | --- | --- |
| Let people sign in with a password, an emailed link, a passkey or GitHub/Google | [Users](/modules/identity/users) | Auth, Notify |
| Protect your own server routes and accept API tokens | [Auth](/modules/identity/auth) | Notify (server mode) |
| Give signed-in users profile, security and API token pages | [Account](/modules/identity/account) | Auth, Users, UI |
| Decide who may open a page or call a route, by role or ability | [Authorization](/modules/identity/authorization) | Auth, Users (server mode) |
| Store typed settings per user | [Preferences](/modules/identity/preferences) | Auth, Users |
| Let users sign in to your other apps through this one, as an [issuer](/guide/concepts/glossary) | [OAuth Server](/modules/identity/oauth-server) | Auth, Users, MCP, UI |
| Accept an issuer's access tokens in a separate service | [OAuth Resource](/modules/identity/oauth-resource) | Auth, Users |
| Build a mobile app with Capacitor | [Mobile](/modules/interface/mobile) | Auth, when you configure `authentication` |
| Take one-time payments | [Payments](/modules/commerce/payments) | Auth, Users, Stripe, MCP, UI |
| Sell memberships or other recurring subscriptions | [Subscriptions](/modules/commerce/subscriptions) | Auth, Users, Notify, Stripe, MCP, UI |
| Sell tickets to events and check people in | [Events](/modules/features/events) | Auth, Users, MCP, UI, Stripe, Payments |
| Collect form submissions | [Forms](/modules/features/forms) | Auth, Users, MCP, Notify, UI |
| Show a cookie banner and record consent | [Cookie Consent](/modules/features/cookie-consent) | Nothing else |
| Let AI agents call your app's tools within the user's scopes | [MCP](/modules/features/mcp) | Auth |
| Give staff a guarded admin area | [Admin](/modules/interface/admin) | Menu, Widget, UI |
| Send email and SMS | [Notify](/modules/platform/notify) | Nothing else |
| Write a module of your own | [Module Kit](/modules/platform/module-kit) | Nothing else |

Every module that stores data also needs [NuxtHub](/guide/concepts/glossary) for the database. It is listed on each
module's page.

## The modules by category

Each module page starts with what the module does and a quick setup. The badges on that page say where it runs:

- **Server.** Server routes and utilities in [Nitro](/guide/concepts/glossary).
- **Client.** Code that runs in the browser.
- **Mobile.** Works in a Capacitor app.

Larger modules are a folder of pages. The first page of the folder is the overview.

### Identity

Who your users are, how they sign in and what they may do.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [Auth](/modules/identity/auth) | Signs people in and tells every server route who is calling. In [client mode](/modules/identity/auth/client-mode) it signs in at an issuer instead, for single-page apps (SPAs) and Capacitor apps. | ✓ | ✓ | ✓ |
| [Users](/modules/identity/users) | The users table, staff administration of users, and self-service profile, email and password changes. | ✓ | ✓ |  |
| [Account](/modules/identity/account) | Profile, security, documents and API token pages for signed-in users. |  | ✓ |  |
| [Authorization](/modules/identity/authorization) | Abilities, policies, route rules, `<Can>` and a role on users. Works in both Auth modes. | ✓ | ✓ | ✓ |
| [Preferences](/modules/identity/preferences) | Typed per-user preferences, optionally sent to OAuth applications as claims. | ✓ | ✓ |  |
| [OAuth Server](/modules/identity/oauth-server) | Makes your app an OAuth 2.0 / OpenID Connect issuer that your other apps sign in through. | ✓ | ✓ |  |
| [OAuth Resource](/modules/identity/oauth-resource) | Lets a service accept an issuer's access tokens, so one mobile app signs in once and calls every service. | ✓ |  |  |

::note
The `@frigear-nu/oauth-client` package is deprecated. [Auth in client mode](/modules/identity/auth/client-mode)
replaces it.
::

### Commerce

Taking money through Stripe.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [Stripe](/modules/commerce/stripe) | Links users to Stripe customers, verifies one webhook and passes its events to other modules. | ✓ |  |  |
| [Payments](/modules/commerce/payments) | One-time Stripe payments with lifecycle hooks. | ✓ | ✓ |  |
| [Subscriptions](/modules/commerce/subscriptions) | Recurring subscriptions with plans and entitlements that your app defines. | ✓ | ✓ |  |

### Features

Ready-made product features.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [Events](/modules/features/events) | Events with ticket types, addons, capacity, membership rules and QR check-in. | ✓ | ✓ |  |
| [Forms](/modules/features/forms) | Forms stored in the database, with conditional fields, uploads and delivery. | ✓ | ✓ |  |
| [Cookie Consent](/modules/features/cookie-consent) | A General Data Protection Regulation (GDPR) banner with consent categories, gating and proof of consent. | ✓ | ✓ |  |
| [MCP](/modules/features/mcp) | Model Context Protocol (MCP) tools that other modules add, limited by the caller's scopes. | ✓ |  |  |

### Interface

The shell, navigation and components that screens are built from.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [UI](/modules/interface/ui) | Shared components, composables and the Nuxt UI integration. |  | ✓ |  |
| [Admin](/modules/interface/admin) | A guarded admin shell, dashboard and navigation that modules add pages to. |  | ✓ |  |
| [Menu](/modules/interface/menu) | Named navigation menus that modules and content add items to. | ✓ | ✓ |  |
| [Widget](/modules/interface/widget) | Named widget and tab areas that modules add components to. |  | ✓ |  |
| [Mobile](/modules/interface/mobile) | A Capacitor app shell: one tab registry for native and web tab bars, native features, deep links and a CLI. |  | ✓ | ✓ |

### Platform

The foundations that other modules and apps stand on.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [Module Kit](/modules/platform/module-kit) | Helpers for writing modules, the server toolkit and extendable database tables. | ✓ |  |  |
| [Notify](/modules/platform/notify) | Email, SMS and simple notification drivers and dispatch. | ✓ |  |  |
| [Email Templates](/modules/platform/email-templates) | Vue email templates that modules ship and apps override. | ✓ |  |  |
| [Base Layer](/modules/platform/base-layer) | A Nuxt layer, not a module. Your app extends it to get the modules, styling and content conventions of Frigear websites. |  | ✓ |  |

## How they fit together

A module installs the modules it depends on when Nuxt loads it. So your app lists only the modules it uses directly.
Each module's page names these under **Installed for you**.

The picture shows the main chains, without Module Kit. An arrow points from a module to a module it installs.

```text
Account, Preferences, OAuth Server, OAuth Resource ──▶ Users ──▶ Auth ──▶ Notify
                                                         ▲
Events ──▶ Payments ──▶ Stripe ──────────────────────────┘
Subscriptions ────────▶ Stripe
```

A few links need a word more:

- **Mobile apps.** The app sets `authentication.mode: 'client'` itself and picks its guards with Authorization. It
  signs in at an issuer such as OAuth Server. Each service it calls checks the token with OAuth Resource.
  [Identity](/guide/concepts/identity) explains how these parts fit.
- **Events and Subscriptions.** Events reads memberships from Subscriptions when both are installed.
- **Admin screens.** Admin provides the shell. Users, Subscriptions, Payments, Events, Forms and OAuth Server add their
  admin pages only when Admin is installed.
- **Extension points.** Menu, Widget and MCP are [registries](/guide/concepts/glossary) that other modules add entries
  to. See [Extension points](/guide/concepts/extension-points).

::note
For module authors: a module lists its dependencies in `moduleDependencies` in its `module.ts`. Optional entries are
used only when the app installs them.
::

## Next steps

- [Add a module](/get-started/adding-modules#add-a-module) – install your first module in your app and generate its
  migration.
- [Identity](/guide/concepts/identity) – choose the sign-in modules for a web app, a mobile app and the services they
  call.
- [Extension points](/guide/concepts/extension-points) – see how modules add menus, widgets, scopes and tools to each
  other.
- [Writing a module](/contribute/writing-a-module/scaffold) – build your own module, starting from
  `pnpm cli module:create`.
