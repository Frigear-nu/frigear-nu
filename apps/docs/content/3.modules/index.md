---
title: Modules
description: Every Frigear Nuxt module, grouped by what it does, with how they depend on each other.
---

A **module** is a [Nuxt module](https://nuxt.com/docs/4.x/guide/modules) that adds a feature to an application.
Modules live under `packages/` and are consumed with the pnpm `workspace:*` protocol. Each page follows the same
layout: requirements, quick setup, options, then server, app, hooks, routes and database reference.

::note
Every module is a **Nuxt 4** module (Nuxt `^4.6`, app code under `app/`), and every Quick setup is a Nuxt 4
`nuxt.config.ts`. New to the modules? The [workspace starter](/examples/starters/workspace) sets up a Nuxt 4 app with
sign-in, account pages and a user admin.
::

## Identity and access

| Module | What it does |
| --- | --- |
| [Account](/modules/identity/account) | Profile, security, documents and API token pages for signed-in users. |
| [Auth](/modules/identity/auth) | Sign-in (password, magic link, OAuth, passkeys), API tokens, and one `requireAuth` for every credential. |
| [Authorization](/modules/identity/authorization) | Abilities, policies, route rules, `<Can>` and a `role` on users. |
| [MCP](/modules/features/mcp) | Scope-gated MCP tools that other modules contribute. |
| [OAuth Server](/modules/identity/oauth-server) | OAuth 2.0 / OpenID Connect server for applications your users sign in to. |
| [Frigear Resource](/modules/identity/frigear-resource) | Accept frigear.nu access tokens in a service, so one mobile app signs in once and calls every service. |
| [OAuth Client](/modules/identity/oauth-client) | PKCE sign-in for browser SPAs and Capacitor apps, with rotating refresh tokens, secure storage and an authorized `$api`. |
| [Preferences](/modules/identity/preferences) | Typed per-user preferences, optionally forwarded as OAuth claims. |
| [Users](/modules/identity/users) | The user entity, staff administration and self-service profile, email and password changes. |

## Commerce

| Module | What it does |
| --- | --- |
| [Events](/modules/features/events) | Events with ticket types, addons, capacity, membership rules and QR check-in. |
| [Payments](/modules/commerce/payments) | One-time Stripe payments with lifecycle hooks. |
| [Stripe](/modules/commerce/stripe) | Customer linking, one verified webhook and an event-listener API. |
| [Subscriptions](/modules/commerce/subscriptions) | Recurring subscriptions with host-defined plans and entitlements. |

## Interface and content

| Module | What it does |
| --- | --- |
| [Admin](/modules/interface/admin) | Guarded admin shell, dashboard and navigation that modules register into. |
| [Cookie Consent](/modules/features/cookie-consent) | GDPR banner, consent categories, gating and proof of consent. |
| [Forms](/modules/features/forms) | Database-backed forms with conditional fields, uploads and delivery. |
| [Menu](/modules/interface/menu) | Named navigation menus that modules and content contribute to. |
| [Mobile](/modules/interface/mobile) | Capacitor app shell: one tab registry for native and web tab bars, native features, deep links and a CLI. |
| [UI](/modules/interface/ui) | Shared components, composables and Nuxt UI integration. |
| [Widget](/modules/interface/widget) | Named widget and tab areas that modules contribute components to. |

## Building blocks

| Module | What it does |
| --- | --- |
| [Module Kit](/modules/platform/module-kit) | Helpers for writing modules and extending database schemas. |
| [Notify](/modules/platform/notify) | Email, SMS and simple notification drivers and dispatch. |

## How they fit together

Most feature modules install what they need through `moduleDependencies`, so a host lists only the modules it uses
directly. The main chains:

- **Sign-in:** `users` installs `auth`, `notify` and `menu`. `account`, `authorization`, `preferences` and
  `oauth-server` build on `users` and `auth`.
- **Mobile apps:** `mobile` installs `oauth-client` when `oauthClient` is configured. The app signs in at an issuer such as
  `oauth-server`, and each service it calls verifies the token with `frigear-resource`.
- **Commerce:** `subscriptions`, `payments` and `events` build on `stripe` and `auth`. `events` can read memberships from
  `subscriptions`.
- **Admin screens:** `admin` provides the shell. `users`, `subscriptions`, `payments`, `events`, `forms` and
  `oauth-server` add pages when it is installed.
- **Extension points:** `menu`, `widget` and `mcp` are registries that other modules contribute to.

Writing your own? Follow [Writing a module](/contribute/writing-a-module/scaffold), which starts from the
`pnpm cli module:create` command described in [CLI](/contribute/tooling/cli), and see [Module Kit](/modules/platform/module-kit) for the
helpers.
