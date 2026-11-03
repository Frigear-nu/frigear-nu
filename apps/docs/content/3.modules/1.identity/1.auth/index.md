---
title: Auth
description: Sign-in (password, magic link, OAuth, passkeys), user API tokens and one requireAuth for cookie sessions, tokens and OAuth access tokens, with scopes; or, in client mode, a public PKCE client for SPAs and Capacitor apps.
navigation:
  title: Overview
---

The [Nuxt module](https://nuxt.com/docs/4.x/guide/modules) that owns **authentication**: how people sign in, and for
every server route, who is calling and how. [Users](/modules/identity/users), [Authorization](/modules/identity/authorization),
[OAuth Server](/modules/identity/oauth-server) and the feature modules build on it; it depends on none of them and knows users
only through the `AuthUserStore` that Users provides.

Auth has two modes, set with `authentication.mode` in the app's own config:

| Mode | For | Who is signed in |
| --- | --- | --- |
| `server` (default) | A Nuxt app with a server: everything on this page. | A sealed cookie session on this app's server. |
| `client` | A browser SPA or a Capacitor app without a server. See [Client mode](/modules/identity/auth/client-mode). | Tokens from an issuer, kept in the browser or the Keychain. |

Both modes give the app the same client API: `useUserSession()` (who is signed in), `useAuth()` (the actions) and
`$api` / `useApi()` (calls to the API). Guards come from [Authorization](/modules/identity/authorization) in both.

:module-runtime{server client mobile}

::note
In server mode, **requires** `@nuxthub/core`, `@frigear-nu/module-kit`, [`@frigear-nu/notify`](/modules/platform/notify) (sign-in emails),
[`@frigear-nu/menu`](/modules/interface/menu) (logout item) and `nuxt-auth-utils`. Nuxt installs them as modules, but
`@nuxthub/core` is an optional peer (client mode does not use it): a server-mode app adds it itself
(`pnpm add @nuxthub/core`), and fails with a clear message without it. Passkeys need the optional peers
`@simplewebauthn/browser` and `@simplewebauthn/server`; the shipped pages need `@nuxt/ui`.

The config key is `authentication`, not `auth` (that belongs to nuxt-auth-utils).
::

A caller is one of three kinds, all resolved into the same `AuthPrincipal`:

| `kind` | Credential | Scopes |
| --- | --- | --- |
| `session` | Sealed cookie from [nuxt-auth-utils](https://github.com/atinux/nuxt-auth-utils) | Everything (`*`) |
| `user-token` | `Authorization: Bearer fnu_…` (prefix configurable), a static token the user created | The scopes chosen at creation |
| `oauth` | `Authorization: Bearer <JWT>`, an access token issued to an application | The scopes the user granted |

## Quick setup

[Users](/modules/identity/users) installs Auth for you. Add it yourself when you use it on its own:

```bash
pnpm add @frigear-nu/auth @nuxthub/core
```

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/auth'],
  authentication: {
    settings: {
      password: true,
      pages: { login: true, register: '/sign-up' },
    },
  },
})
```

::warning
The module extends the `users` table (see [Database](/modules/identity/auth/reference#database)). That only changes the generated Drizzle schema, so
generate and commit a migration in your app and in every fixture that includes the module. See
[Module Kit](/modules/platform/module-kit).
::

## Options

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `mode` | `'server' \| 'client'` | `'server'` | Set it in the app's own `nuxt.config` only: a mode from inline module options or another module's default fails the build. `client` is described in [Client mode](/modules/identity/auth/client-mode). |
| `client` | `ClientModuleOptions` | | Client mode only: the issuer and how the app talks to it. |
| `apiTokens` | `boolean \| { prefix?: string }` | `true` | User API tokens. `false` turns them off; `prefix` (default `fnu_`) is what new tokens start with. See [User API tokens](/modules/identity/auth/server#user-api-tokens). |
| `tokenTtlDays` | `number \| null` | `null` | Default lifetime for new user tokens; `null` = never expire. |
| `userStore` | `string` | the one from Users | Path to a module whose default export is an `AuthUserStore`. |
| `scopes` | `AuthScopeDefinition[]` | `[]` | Extra scopes users can pick for tokens. |
| `settings` | `AuthSettings` | see below | The sign-in flows. |

### `settings`

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `password` | `boolean` | `true` | Email/password login and register routes, composables and pages. |
| `passwordReset` | `boolean` | `true` with `password` | Forgot/reset-password routes. Needs `password`. |
| `webAuthn` | `boolean` | `false` | Passkey routes, composables and table. |
| `magicLink` | `boolean \| { signUp?, cooldown? }` | off | Emailed single-use sign-in link. Following it verifies the address. `signUp: true` creates accounts for unknown addresses; `cooldown` = minimum seconds between two links for one user (default `60`). |
| `verifyEmail` | `boolean` | `false` | Users who register with a password must verify their address (emailed link) before they can log in; registration creates no session. |
| `cleanup` | `string \| false` | `'0 3 * * *'` | Cron for the `auth:clear-expired-tokens` task (expired magic links and resets); `false` schedules nothing, the task stays registered. |
| `pages.login` | `string \| boolean` | off | Login page. `true` = `/login`. |
| `pages.register` | `string \| boolean` | off | Register page. `true` = `/register`. May be an absolute URL: the login page links to it and no local page is added. |
| `pages.callback` | `boolean` | `true` | Client mode only: the callback page. |
| `afterLogin` | `string` | `'/'` | Where users land after signing in (password, passkey, magic link, OAuth/SSO) when no `?redirect=` was requested. Must be an absolute path on this site. A `?redirect=` on the login page or on `/api/auth/<provider>` takes precedence. |
| `session.mapper` | `string` | pass-through | Path to a default-export function mapping the stored user to the session user shape. |
| `oauth` | `Record<provider, boolean \| { label?, icon?, signUp?, config?, keepTokens? }>` | `{}` | Overrides per OAuth provider, `false` keeps one off. Providers turn on through their credentials, see [OAuth providers](#oauth-providers). |

The login and register pages are enabled per path. With `pages.login` the module also registers `/forgot-password` and
`/reset-password` (when `passwordReset` is on). The login page renders the password form, passkey and magic link
controls and OAuth buttons that are actually enabled. When it was opened with `?redirect=` (for example by
[Authorization](/modules/identity/authorization)'s `redirectTo`), it shows an alert that you have to sign in to continue and
returns there after signing in. A page can say why with `?reason=<namespace>`: the alert then reads the i18n keys
`<namespace>.signInReason.title` and `<namespace>.signInReason.description`, so each module words its own reason
(for example `?reason=users.emailChange`). Unknown reasons show the generic `auth.signInReason` text.

With `magicLink` or `verifyEmail`, the module also registers the `/auth/magic-link` page that the emailed links open
(whenever `@nuxt/ui` is installed, with or without `pages.login`). Opening it changes nothing, because mail scanners
and link previews follow links too. Its **Continue signing in** button posts the code to
`/api/auth/magic-link/confirm`, then goes to the link's `redirect` or `afterLogin`. A used or expired link shows an
error on the page. Without `@nuxt/ui`, add your own page at that path that posts the `code`.

### OAuth providers

Every [nuxt-auth-utils provider](https://github.com/atinux/nuxt-auth-utils#supported-oauth-providers) (GitHub,
Google, Auth0, Okta, Keycloak, Microsoft, ... and `oidc` for any other OpenID Connect provider) signs in at
`GET /api/auth/<provider>`. It is off by default and turns on, **per request**, once nuxt-auth-utils has its credentials.
These are the env vars that nuxt-auth-utils documents for the provider:

```bash
NUXT_OAUTH_AUTH0_CLIENT_ID=...
NUXT_OAUTH_AUTH0_CLIENT_SECRET=...
NUXT_OAUTH_AUTH0_DOMAIN=example.eu.auth0.com

# Any OpenID Connect provider
NUXT_OAUTH_OIDC_CLIENT_ID=...
NUXT_OAUTH_OIDC_CLIENT_SECRET=...
NUXT_OAUTH_OIDC_OPENID_CONFIG=https://sso.example.com/.well-known/openid-configuration
```

Without credentials the route answers `404` and the login page shows no button. Register
`<origin>/api/auth/<provider>` as the callback URL at the provider.

List a provider in `oauth` only to change it:

```ts
authentication: {
  settings: {
    oauth: {
      auth0: {
        label: 'Company SSO', // button label (default: the provider's name, translatable as `auth.oauth.<provider>.label`)
        icon: 'i-simple-icons-auth0', // iconify name
        signUp: false, // only sign in existing users; unknown emails go back to the login page
        config: { scope: ['openid', 'profile', 'email'] }, // passed to the nuxt-auth-utils handler
        keepTokens: true, // keep its access and refresh tokens, see "Keeping provider tokens"
      },
      github: false, // off, even with credentials
    },
  },
}
```

- Users are matched by email, and an account is created for an unknown email unless `signUp` is `false`. A provider
  that reports `email_verified: false` is refused.
- With `oauth.frigear` on, the `NUXT_OAUTH_OIDC_*` credentials belong to "Log in with frigear.nu" (below). The plain
  `oidc` provider then needs listing too, e.g. `oidc: { label: 'Company SSO' }`.
- `GET /api/auth/providers` returns the buttons for the request, `[{ key, to, label?, icon?, external? }]`.
  `useLogin().oauthProviders` fills in the default labels and icons.

### Keeping provider tokens

By default a login keeps nothing of the provider's tokens. Set `keepTokens: true` on a provider (`oauth.frigear` too)
to keep its access token, refresh token, expiry and granted scopes, so the app can call the provider as the user: also
from a scheduled task or a bearer request, where there is no session.

- They live in the `auth_oauth_tokens` table (one row per user and provider), which `keepTokens` on any provider adds.
  Generate a migration for it. Every login with the provider replaces the row (a step-up login replaces the plain one).
- The token columns are encrypted with AES-GCM (WebCrypto), bound to the provider. The key is derived from
  `NUXT_AUTH_TOKENS_KEY` (`runtimeConfig.authTokensKey`), else from the session password. Changing it makes the kept
  tokens unreadable: users log in again.
- `deleteUserAuthData` removes them with the user; a re-keyed user (`forceId`) keeps them.

```ts
// The caller's tokens (event), or a user's by id (a task syncing with an admin's token). `null` when none are kept.
const tokens = await getOAuthTokens(event, 'frigear') // { accessToken, refreshToken?, tokenType?, expiresAt, scopes }

// A usable access token: refreshed first when it expired, `null` when there is none, it lacks one of `scopes`,
// or it cannot be refreshed.
const token = await getOAuthAccessToken(adminId, 'frigear', { scopes: ['users:read'] })

await revokeOAuthTokens(userId, 'frigear') // forget them ("disconnect")
```

An expired token is refreshed with its refresh token at the provider's token endpoint, found through OIDC discovery:
frigear.nu's, or the `openidConfig` of an `oidc`-style provider (`NUXT_OAUTH_<PROVIDER>_OPENID_CONFIG`). Other
providers' tokens are used until they expire. One refresh runs at a time per user and provider, because providers
rotate refresh tokens and treat a replayed one as theft.

### Log in with frigear.nu

`oauth.frigear` registers `GET /auth/frigear`, an OIDC login against frigear.nu for PR previews and local development.
It is decided **per request**: active when `runtimeConfig.previewDeployment` is `true` or `runtimeConfig.frigear.sso`
has a client id and secret; otherwise the route answers `404` and the button is hidden. Register `<origin>/auth/frigear`
as the callback on frigear.nu.

| Runtime config | Env var | Purpose |
| --- | --- | --- |
| `previewDeployment` | `NUXT_PREVIEW_DEPLOYMENT` | Enables the login without credentials (set it yourself, e.g. from a CI marker). |
| `frigear.sso.url` | `NUXT_FRIGEAR_SSO_URL` | Identity provider origin (defaults to the frigear.nu origin). |
| `frigear.sso.clientId` | `NUXT_FRIGEAR_SSO_CLIENT_ID` | OAuth client id. |
| `frigear.sso.clientSecret` | `NUXT_FRIGEAR_SSO_CLIENT_SECRET` | OAuth client secret. |
| `frigear.sso.scopes` | `NUXT_FRIGEAR_SSO_SCOPES` | Scopes every login asks for, space separated (default `openid profile email`; `openid` is always added). |
| `frigear.sso.stepUpScopes` | `NUXT_FRIGEAR_SSO_STEP_UP_SCOPES` | Extra scopes a login may ask for with `/auth/frigear?scope=...`, space separated (default none). |
| `frigear.forceId` | `NUXT_FRIGEAR_FORCE_ID` | Make the local `users.id` equal the frigear.nu id (default `false`). |
| `frigear.syncRole` | - | Apply the role claim at every login (default `true`). Declare it in your `runtimeConfig` to override. |
| `frigear.keepTokens` | `NUXT_FRIGEAR_KEEP_TOKENS` | Keep the frigear.nu tokens ([Keeping provider tokens](#keeping-provider-tokens)). Defaults to `oauth.frigear.keepTokens`, which also adds the table; turning it on at runtime only works with the table. |
| `public.authentication.frigearSso` | `NUXT_PUBLIC_AUTHENTICATION_FRIGEAR_SSO` | Whether the build saw the credentials. The button follows the route (`GET /api/auth/providers`). |

Instead of `frigear.sso`, the credentials can come from nuxt-auth-utils' `NUXT_OAUTH_OIDC_CLIENT_ID`,
`NUXT_OAUTH_OIDC_CLIENT_SECRET` and `NUXT_OAUTH_OIDC_OPENID_CONFIG`.

- The `id_token` is verified against the provider's `jwks_uri` (cached for an hour), including issuer and audience.
  Users are matched by email; a verified `email_verified` claim verifies the address.
- `forceId` updates a user with that id, re-keys an existing user with the same email (rows referencing `users.id`
  follow; a different user holding the id moves to the next free id), or creates a user with that id.
- The `role` claim, else the namespaced `https://frigear.nu/claims/role`, else the first of `roles`, is applied to the
  local `role` at **every login**. Without a claim the stored role is left alone. It needs the `role` column of
  [Authorization](/modules/identity/authorization). These claim names follow the current frigear.nu and will change when this
  app becomes frigear.nu. The provider side is the host's: add the claim in the `oauth:claims` hook of
  [OAuth Server](/modules/identity/oauth-server).
- The optional `color_mode` claim (`light`, `dark`, `system`) is kept on the session as `frigear.colorMode` and applied
  once per login.
- **Step-up.** A login asks for `frigear.sso.scopes`. To ask for more only when it is needed (an admin connecting for
  sync, not everyone at every login), allow the scope in `stepUpScopes` and send the user to
  `/auth/frigear?scope=users:read` (combine with `&redirect=/admin/sync`). Requested scopes outside the allowlist are
  ignored. frigear.nu decides what it grants: a staff-only scope such as `users:read` is dropped for anyone else, so
  check the kept `scopes` rather than assuming the step-up worked. With `keepTokens`, the step-up login's tokens
  replace the ones kept before.

```ts
// oauth: { frigear: { keepTokens: true } }, NUXT_FRIGEAR_SSO_STEP_UP_SCOPES=users:read
const token = await getOAuthAccessToken(event, 'frigear', { scopes: ['users:read'] })
if (!token) throw apiError(403, 'frigear_not_connected', 'Connect frigear.nu for sync: /auth/frigear?scope=users:read')
const users = await $fetch('https://frigear.nu/api/admin/users', { headers: { Authorization: `Bearer ${token}` } })
```

## On this module

- [Server API](/modules/identity/auth/server): `requireAuth`, policy gates and staff guards, scopes, user API tokens, OAuth access tokens and auth emails.
- [Reference](/modules/identity/auth/reference): composables, hooks, routes, database tables and translations.
- [Client mode](/modules/identity/auth/client-mode): `authentication.mode: 'client'`, the public PKCE client for SPAs and
  Capacitor apps, and the migration from `@frigear-nu/oauth-client`.
