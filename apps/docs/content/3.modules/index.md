---
title: Modules
description: Every Frigear Nuxt module, grouped by what it does, with how they depend on each other.
---

A **module** is a [Nuxt module](https://nuxt.com/docs/4.x/guide/modules) that adds a feature to an application. Modules
live under `packages/` and are published as `@frigear-nu/<name>`. Each module page follows the same layout: a short
introduction, quick setup, options, then server, app, hooks, routes, database and translations reference. The larger
modules are split into a folder whose first page is the overview.

::note
Every module is a **Nuxt 4** module (Nuxt `^4.6`, app code under `app/`), and every quick setup is a Nuxt 4
`nuxt.config.ts`. New to the modules? The [workspace starter](/examples/starters/workspace) sets up a Nuxt 4 app with
sign-in, account pages and a user admin.
::

## Identity

Who the users are, how they sign in and what they may do.

- [Auth](/modules/identity/auth): sign-in (password, magic link, OAuth, passkeys), API tokens, and one `requireAuth` for every credential.
- [Users](/modules/identity/users): the user entity, staff administration and self-service profile, email and password changes.
- [Account](/modules/identity/account): profile, security, documents and API token pages for signed-in users.
- [Authorization](/modules/identity/authorization): abilities, policies, route rules, `<Can>` and a `role` on users.
- [Preferences](/modules/identity/preferences): typed per-user preferences, optionally forwarded as OAuth claims.
- [OAuth Server](/modules/identity/oauth-server): an OAuth 2.0 / OpenID Connect server for applications your users sign in to.
- [OAuth Client](/modules/identity/oauth-client): PKCE sign-in for browser SPAs and Capacitor apps, with rotating refresh tokens and an authorized `$api`.
- [Frigear Resource](/modules/identity/frigear-resource): accept frigear.nu access tokens in a service, so one mobile app signs in once and calls every service.

## Commerce

Taking money through Stripe.

- [Stripe](/modules/commerce/stripe): customer linking, one verified webhook and an event-listener API.
- [Payments](/modules/commerce/payments): one-time Stripe payments with lifecycle hooks.
- [Subscriptions](/modules/commerce/subscriptions): recurring subscriptions with host-defined plans and entitlements.

## Features

Ready-made product features.

- [Events](/modules/features/events): events with ticket types, addons, capacity, membership rules and QR check-in.
- [Forms](/modules/features/forms): database-backed forms with conditional fields, uploads and delivery.
- [Cookie Consent](/modules/features/cookie-consent): GDPR banner, consent categories, gating and proof of consent.
- [MCP](/modules/features/mcp): scope-gated MCP tools that other modules contribute.

## Interface

The shell, navigation and components that screens are built from.

- [UI](/modules/interface/ui): shared components, composables and Nuxt UI integration.
- [Admin](/modules/interface/admin): guarded admin shell, dashboard and navigation that modules register into.
- [Menu](/modules/interface/menu): named navigation menus that modules and content contribute to.
- [Widget](/modules/interface/widget): named widget and tab areas that modules contribute components to.
- [Mobile](/modules/interface/mobile): Capacitor app shell with one tab registry for native and web tab bars, native features, deep links and a CLI.

## Platform

Building blocks other modules and apps stand on.

- [Module Kit](/modules/platform/module-kit): helpers for writing modules, the server toolkit and extendable database schemas.
- [Notify](/modules/platform/notify): email, SMS and simple notification drivers and dispatch.
- [Email Templates](/modules/platform/email-templates): Vue email templates that modules ship and apps override.
- [Base Layer](/modules/platform/base-layer): the shared Nuxt **layer** (not a module) that wires the modules, styling and content conventions for Frigear websites.

## How they fit together

Most feature modules install what they need through `moduleDependencies`, so a host lists only the modules it uses
directly. The main chains:

- **Sign-in:** `users` installs `auth`, `notify` and `menu`. `account`, `authorization`, `preferences` and
  `oauth-server` build on `users` and `auth`.
- **Mobile apps:** `mobile` installs `oauth-client` when `oauthClient` is configured. The app signs in at an issuer such as
  `oauth-server`, and each service it calls verifies the token with `frigear-resource`. See
  [Identity](/guide/concepts/identity) for how the OAuth modules relate.
- **Commerce:** `subscriptions`, `payments` and `events` build on `stripe` and `auth`. `events` can read memberships from
  `subscriptions`.
- **Admin screens:** `admin` provides the shell. `users`, `subscriptions`, `payments`, `events`, `forms` and
  `oauth-server` add pages when it is installed.
- **Extension points:** `menu`, `widget` and `mcp` are registries that other modules contribute to. See
  [Extension points](/guide/concepts/extension-points).

Writing your own? Follow [Writing a module](/contribute/writing-a-module/scaffold), which starts from the
`pnpm cli module:create` command described in [CLI](/contribute/tooling/cli), and see [Module Kit](/modules/platform/module-kit)
for the helpers.
