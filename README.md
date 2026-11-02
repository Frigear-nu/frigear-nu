# @frigear-nu/root
> NOTE: In the future this code will be replacing [frigear-nu/nuxt-frigear-nu](https://github.com/Frigear-nu/nuxt-frigear-nu) as the main frigear nuxt application.


[Deployed Main Website](https://)
A Rewrite of the previous nuxt [simple content site](https://github.com/hareland/simple-content-site) based website of [frigear.nu](https://github.com/Frigear-nu/nuxt-frigear-nu) to a more modular and composable format.

The purpose of this repo is to provide a base for building a modular nuxt application with shared modules and components that can be used across multiple applications within the frigear ecosystem.

## Quick start: a new app on the modules

The modules are **Nuxt 4** modules (Nuxt `^4.6`, `app/` directory structure); Nuxt 3 is not supported.
[`.starters/workspace`](./.starters/workspace) is a ready pnpm workspace with one Nuxt 4 app (`apps/web`) that has
register/login, `/account` pages and an `/admin` user admin. Copy it with [giget](https://github.com/unjs/giget):

```bash
pnpx giget@latest gh:Frigear-nu/frigear-nu/.starters/workspace my-project
cd my-project
git init
corepack enable
pnpm install
pnpm prepare:env   # then set NUXT_SESSION_PASSWORD and NUXT_ACL_ADMINS (your email) in apps/web/.env
pnpm dev
```

Open http://localhost:3000, create an account with the email in `NUXT_ACL_ADMINS`, then visit `/account` and `/admin`.
The full walkthrough, including how to add more modules, is the
[Quick start guide](./apps/docs/content/1.getting-started/3.quick-start.md) in the docs.

To work on this repository itself, see [Local development](./apps/docs/content/1.getting-started/4.local-development.md).

## Starters

- [.starters/workspace](./.starters/workspace) - pnpm monorepo + Nuxt 4 app wired to users, auth, authorization, account and admin. Not part of this workspace: it uses the published versions.


## Apps

- [@frigear-nu/website](./apps/website) - the main website application
- [@frigear-nu/docs](./apps/docs) - the documentation application


## Packages

- [@frigear-nu/ui](./packages/ui) - Shared UI components
- [@frigear-nu/base](./packages/base-layer) - Nuxt layer with the shared config, UI defaults and content-driven pages that websites extend
- [@frigear-nu/cli](./packages/cli) - Private scaffolder (`pnpm cli module:create`) for new modules
- [@frigear-nu/eslint-config](./packages/eslint-config)
- [@frigear-nu/module-kit](./packages/module-kit) - Shared module kit for building nuxt modules within frigear
- [@frigear-nu/oauth-server](./packages/oauth-server) - OAuth 2.0 / OpenID Connect server: role-restricted applications, PKCE, host-enriched tokens, a scope registry for every service
- [@frigear-nu/frigear-resource](./packages/frigear-resource) - Resource server for frigear.nu: accepts its `at+jwt` access tokens (JWKS, audience, scopes), provisions users and allows the mobile app's bearer CORS
- [@frigear-nu/auth](./packages/auth) - Authentication: sign-in flows (password, magic link, OAuth, passkeys), user API tokens and one `requireAuth` for cookie sessions, tokens and OAuth access tokens, with scopes
- [@frigear-nu/mcp](./packages/mcp) - Scoped, PII-safe MCP tools contributed by modules on top of `@nuxtjs/mcp-toolkit`
- [@frigear-nu/users](./packages/users) - The user entity: users table, staff administration and self-service profile, email and password changes
- [@frigear-nu/notify](./packages/notify) - Email notification driver/dispatch Nuxt module (app chooses the driver), shared across modules
- [@frigear-nu/email-templates](./packages/email-templates) - Vue email templates for notify (nuxt-email-renderer): typed `sendEmailTemplate`, and module emails rendered from templates the host can override
- [@frigear-nu/menu](./packages/menu) - Named, shareable navigation menus (`extendMenu`, Nuxt Content, `useMenu`) contributed to by other frigear modules
- [@frigear-nu/widget](./packages/widget) - Named widget areas that modules contribute components to and hosts render (`extendWidgets`, `<WidgetArea>`, `widgets:filter`)
- [@frigear-nu/admin](./packages/admin) - Generic admin area: guarded shell, dashboard and navigation that other modules register into
- [@frigear-nu/authorization](./packages/authorization) - Policy-based authorization: `defineAbility` policies, client/server resolvers, route rules, `<Can>` and a `role` column on `users`
- [@frigear-nu/account](./packages/account) - Account area pages (profile, security, documents, API tokens) over the users and auth modules
- [@frigear-nu/preferences](./packages/preferences) - Typed per-user preferences that modules and the host register (`definePreferences`), stored in one JSON column on `users` and optionally forwarded to OAuth apps as claims
- [@frigear-nu/stripe](./packages/stripe) - Core Stripe plumbing: SDK access, customer linking and a verified, idempotent webhook other modules subscribe to
- [@frigear-nu/subscriptions](./packages/subscriptions) - Recurring Stripe subscriptions: host-defined plans, checkout, entitlements
- [@frigear-nu/payments](./packages/payments) - One-time Stripe payments (Checkout, refunds) with lifecycle hooks driven by verified Stripe events
- [@frigear-nu/events](./packages/events) - Events with ticket types, addons, capacity, membership requirements, payments and QR check-in
- [@frigear-nu/forms](./packages/forms) - Dynamic, database-stored forms (single page or stepped) with conditional fields, file uploads, submissions and email delivery
- [@frigear-nu/cookie-consent](./packages/cookie-consent) - GDPR cookie consent banner with categories other modules contribute to, `onCookieConsent` gating and consent stored as proof on the user
