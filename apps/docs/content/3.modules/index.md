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
| Decide who may open a page or call a route, by permission and role | [Authorization](/modules/identity/authorization) | Auth, Users (server mode) |
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
| Send email and SMS | [Notify](/modules/communication/notify) | Nothing else |
| Push to a phone and let users choose email, SMS or push | [Push](/modules/communication/push) | Auth, Users, Notify, UI |
| Write a module of your own | [Module Kit](/modules/platform/module-kit) | Nothing else |
| Give users a home screen of cards that modules fill and they can rearrange | [Dashboard](/modules/interface/dashboard) | Widget, UI |
| Decide who may see a record by role, team role or operation | [Audience](/modules/organisation/audience) (a library, not a module) | Nothing else |
| Track the occasions you work at, such as a festival bar, for crew and shifts to attach to | [Operations](/modules/volunteering/operations) | Auth, Audience, Maps, UI |
| Put people in teams with roles, by hand or from their global role or plan | [Teams](/modules/organisation/teams) | Auth, Users, Audience, UI |
| Manage questions and answers once and show them on pages, in the app and on custom pages | [FAQ](/modules/content/faq) | Auth, UI |
| Take applications for an operation's crew, approve them and invite people straight onto a team | [Crew](/modules/volunteering/crew) | Operations, Teams, Forms, Notify, Auth, Users, Audience, UI |
| Publish help articles, public or per role, and track an onboarding checklist | [Help center](/modules/content/help-center) | Auth, UI |
| Plan an operation's shifts, let volunteers swap them, check them in by pass, station or location and earn perks | [Shifts](/modules/volunteering/shifts) | Crew, Teams, Operations, Notify, Auth, Users, Audience, Maps, UI |
| Let a module store a location or a venue layout, with a picker, an editor and viewers | [Maps](/modules/interface/maps) | UI |

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
| [Authorization](/modules/identity/authorization) | Roles, permissions, policies, route rules and `<Can>`. Works in both Auth modes. | ✓ | ✓ | ✓ |
| [Preferences](/modules/identity/preferences) | Typed per-user preferences, optionally sent to OAuth applications as claims. | ✓ | ✓ |  |
| [OAuth Server](/modules/identity/oauth-server) | Makes your app an OAuth 2.0 / OpenID Connect issuer that your other apps sign in through. | ✓ | ✓ |  |
| [OAuth Resource](/modules/identity/oauth-resource) | Lets a service accept an issuer's access tokens, so one mobile app signs in once and calls every service. | ✓ |  |  |

::note
The `@frigear-nu/oauth-client` package is deprecated. [Auth in client mode](/modules/identity/auth/client-mode)
replaces it.
::

### Organisation

Who belongs where: teams with role ladders, and who may see a record.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [Teams](/modules/organisation/teams) | Teams owned by an operation or the platform, members with a role from their kind's ladder, and rules that map global roles and plans to team roles. | ✓ | ✓ |  |
| [Audience](/modules/organisation/audience) | A library, not a module. Shared visibility rules and owner references, and the hooks that tell modules who is looking. | ✓ | ✓ |  |

### Commerce

Taking money through Stripe.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [Stripe](/modules/commerce/stripe) | Links users to Stripe customers, verifies one webhook and passes its events to other modules. | ✓ |  |  |
| [Payments](/modules/commerce/payments) | One-time Stripe payments with lifecycle hooks. | ✓ | ✓ |  |
| [Subscriptions](/modules/commerce/subscriptions) | Recurring subscriptions with plans and entitlements that your app defines. | ✓ | ✓ |  |

### Content

What people read: questions and answers, and help articles.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [FAQ](/modules/content/faq) | Bilingual question-and-answer groups with per-group and per-item visibility, content components for pages and an admin area. | ✓ | ✓ | ✓ |
| [Help center](/modules/content/help-center) | Bilingual help articles in categories, public or per role, onboarding checklists with read tracking, and articles from the database or Nuxt Content. | ✓ | ✓ | ✓ |

### Features

Ready-made product features.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [Events](/modules/features/events) | Events with ticket types, addons, capacity, membership rules and QR check-in. | ✓ | ✓ |  |
| [Forms](/modules/features/forms) | Forms stored in the database, with conditional fields, uploads and delivery. | ✓ | ✓ |  |
| [Cookie Consent](/modules/features/cookie-consent) | A General Data Protection Regulation (GDPR) banner with consent categories, gating and proof of consent. | ✓ | ✓ |  |
| [MCP](/modules/features/mcp) | Model Context Protocol (MCP) tools that other modules add, limited by the caller's scopes. | ✓ |  |  |

### Communication

Reaching people: email, SMS and push, the templates they use, and each user's choice of channel.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [Notify](/modules/communication/notify) | Email, SMS and simple notification drivers and dispatch. | ✓ |  |  |
| [Email Templates](/modules/communication/email-templates) | Vue email templates that modules ship and apps override. | ✓ |  |  |
| [Push](/modules/communication/push) | Device registration, FCM and APNs delivery, and per-user channel choices (email, SMS, push) with a topic registry and `notifyUser`. | ✓ | ✓ | ✓ |

### Interface

The shell, navigation and components that screens are built from.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [UI](/modules/interface/ui) | Shared components, composables and the Nuxt UI integration. |  | ✓ |  |
| [Admin](/modules/interface/admin) | A guarded admin shell, dashboard and navigation that modules add pages to. |  | ✓ |  |
| [Menu](/modules/interface/menu) | Named navigation menus that modules and content add items to. | ✓ | ✓ |  |
| [Widget](/modules/interface/widget) | Named widget and tab areas that modules add components to. |  | ✓ |  |
| [Mobile](/modules/interface/mobile) | A Capacitor app shell: one tab registry for native and web tab bars, native features, deep links and a CLI. |  | ✓ | ✓ |
| [Dashboard](/modules/interface/dashboard) | Dashboards that modules add cards to, with a per-user layout and a mobile Home tab. |  | ✓ | ✓ |
| [Maps](/modules/interface/maps) | A building block for modules: a location picker, a plane layout editor and viewers with live layers. No tables of its own. | ✓ | ✓ | ✓ |

### Platform

The foundations that other modules and apps stand on.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [Module Kit](/modules/platform/module-kit) | Helpers for writing modules, the server toolkit and extendable database tables. | ✓ |  |  |
| [Base Layer](/modules/platform/base-layer) | A Nuxt layer, not a module. Your app extends it to get the modules, styling and content conventions of Frigear websites. |  | ✓ |  |

### Volunteering

Crew work: the occasions Frigear staffs, the crew that work them and their shifts. They build on Organisation, Content,
Communication and Interface.

| Module | What it does | Server | Client | Mobile |
| --- | --- | :---: | :---: | :---: |
| [Operations](/modules/volunteering/operations) | The occasions Frigear works at, with a period, place, venue layout and status, that crew and shifts attach to. | ✓ | ✓ |  |
| [Crew](/modules/volunteering/crew) | Applications, approvals, waiting list and invite links that turn people into an operation's crew, on top of teams. | ✓ | ✓ | ✓ |
| [Shifts](/modules/volunteering/shifts) | Schedules, shift roles, assignment with guards, swaps, check-in by pass, station or location, earned perks and who is on shift now, per operation. | ✓ | ✓ | ✓ |

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
