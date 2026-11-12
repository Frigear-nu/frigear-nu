---
title: OAuth Server
description: Let people sign in to your other apps and services with the account they already have in this app.
navigation:
  title: Overview
---

You have one app where people already have an account, and other apps that should use that same account: a mobile
app, a partner site or a separate service. OAuth Server makes your app the [issuer](/guide/concepts/glossary) for them.
The other apps send people here to sign in and get tokens back, and your app decides who may sign in where. If you only
need people to sign in to this app itself, use [Auth](/modules/identity/auth) instead.

The module is `@frigear-nu/oauth-server`, a [Nuxt module](https://nuxt.com/docs/4.x/guide/modules) that speaks OAuth 2.0
and OpenID Connect (OIDC). It has no role model of its own. It follows the [permissions and roles](/guide/concepts/auth-and-scopes)
of [Auth](/modules/identity/auth) and [Authorization](/modules/identity/authorization): who may manage applications,
which roles may sign in where and which scopes a user may hand to an application are all decided there.

## What you get

- **Pages.**
  - The consent screen at `/authorize`, where a person allows an app to sign them in. On by default.
  - The signed-in user's applications at `/account/applications`. Opt-in.
- **Admin area.**
  - An **OAuth applications** screen at `/admin/oauth` to create, edit and disable applications, and an **OAuth
    scopes** screen at `/admin/oauth/scopes` to define scopes. Opt-in, and only with [Admin](/modules/interface/admin).
  - Menu items in the account menu and the admin sidebar, with [Menu](/modules/interface/menu). On when Menu is
    installed.
- **Server routes.**
  - The standard OAuth and OIDC endpoints: discovery, signing keys, authorize, token, revoke and userinfo. On by
    default.
  - Your own API accepts the [access tokens](/guide/concepts/glossary) these endpoints issue. On by default.
  - A staff API to manage applications and scopes. On by default. It needs the session-only `oauth:manage`
    [permission](/modules/identity/authorization), which the `admin` role gets by default.
  - Token introspection at `POST /oauth/introspect` (RFC 7662), for services that must ask the issuer what a token may
    do now. On by default.
  - A `my-oauth-applications` tool for [MCP](/modules/features/mcp). Opt-in.
- **Composables and helpers.** Composables for the admin screen and the user's applications, and server helpers to
  create applications from code. See [Helpers](/modules/identity/oauth-server/server).
- **Emails.** None.

:module-runtime{server client}

::note
**Installed for you:** [Auth](/modules/identity/auth), [Users](/modules/identity/users), [MCP](/modules/features/mcp),
[UI](/modules/interface/ui) and Module Kit.
**You add:** `@nuxthub/core`, and `@nuxt/ui` for the consent, admin and applications pages.
**Optional:** [Admin](/modules/interface/admin) for the admin screens (it brings [Menu](/modules/interface/menu) for the
menu items), and [Authorization](/modules/identity/authorization) for roles. Without roles nobody holds `oauth:manage`
and every `allowedRoles` list locks everybody out. Quick setup uses both.
::

## Quick setup

::steps

### Install the module

```bash
pnpm add @frigear-nu/oauth-server @frigear-nu/admin @frigear-nu/authorization @nuxthub/core
```

### Configure it in `nuxt.config.ts`

This setup adds Admin for the admin screens and Authorization for roles. The `admin` role holds everything, including
`oauth:manage`, which lets its users manage applications and scopes.

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/admin', '@frigear-nu/authorization', '@frigear-nu/oauth-server'],
  authorization: {
    roles: {
      admin: { label: 'Admin', grant: ['*'] },
    },
  },
  oauthServer: {
    issuer: 'https://id.example.com',
    settings: {
      pages: { admin: true, applications: true },
    },
  },
})
```

### Set a signing key

Generate a key and set it as `NUXT_OAUTH_SERVER_PRIVATE_KEY`, as [Signing keys](/guide/going-further/signing-keys)
shows.

:::caution
Use a different signing key in each environment, and store it as a secret. Anyone who has the key can sign tokens that
your apps and services accept.
:::

:::warning
Without a migration the module's tables do not exist, and every OAuth request fails.
:::

### Generate a migration

The module adds four tables: `oauth_applications`, `oauth_scopes`, `oauth_authorization_codes` and
`oauth_refresh_tokens`. It does not change `users`. Generate and commit a [migration](/get-started/database#migrations)
for them.

### Give someone the admin role

:::warning
Nobody can manage OAuth applications until a user holds a role with `oauth:manage`. Assign the `admin` role to your
first user in the [Authorization admin](/modules/identity/authorization/admin), or from `authorization:roles`. See
[Roles and requirements](/modules/identity/authorization/roles-and-requirements).
:::

Which roles may sign in to an application is set per application, in `allowedRoles`. The module reads the user's
[effective roles](/modules/identity/authorization/roles-and-requirements) from Authorization, so you need no code for
it. [Hooks](/modules/identity/oauth-server/hooks) has the hooks that are left.

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** `/.well-known/openid-configuration` answers with your `issuer` and the endpoint URLs. Signed
in as an admin, `/admin/oauth` lists your OAuth applications and `/admin/oauth/scopes` your scopes.
::

::tip
To register your first application and choose between public and confidential, follow
[Create an OAuth application](/guide/going-further/oauth-application).
::

## Options

Options go under the `oauthServer` key.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `issuer` | `string` | request origin | The `iss` claim and the issuer in discovery. |
| `keyId` | `string` | `'key-1'` | The `kid` of the signing key in the JWKS. |
| `accessTokenTtl` | `number` | `900` | Lifetime of access tokens and ID tokens, in seconds. |
| `accessTokenAudience` | `string \| string[]` | the `client_id` | The `aud` of every access token, such as `frigear-services`. |
| `refreshToken.idleTtl` | `number` | 30 days | How long a refresh token lives unused, in seconds. At most two years. |
| `refreshToken.maxAge` | `number \| null` | `null` | How long a sign-in lives in total, in seconds. `null` means no cap. |
| `refreshTokenTtl` | `number` | 30 days | Deprecated alias of `refreshToken.idleTtl`; warns at build time. |
| `revokeOnCredentialChange` | `boolean` | `true` | Ends a user's sign-ins when their password or email changes. |
| `codeTtl` | `number` | `600` | Lifetime of authorization codes, in seconds. |
| `callbackPath` | `string` | `'/auth/frigear'` | Added to an application's website URL to form its redirect URI. |
| `scopes` | `Array<string \| OAuthScopeDefinition>` | `[]` | Named [scopes](/guide/concepts/glossary) next to `openid profile email`, and how permission scopes read on the consent screen. |
| `cors.origins` | `string[]` | `[]` | Exact browser origins that may call the token, revoke, userinfo and discovery endpoints. |
| `cors.paths` | `string[]` | `[]` | Path prefixes of your own API that the same origins may call with an access token. |
| `clients` | `OAuthConfiguredClient[]` | `[]` | [Configured clients](/guide/concepts/glossary): public OAuth applications with a fixed `client_id`. |
| `settings.pages.authorize` | `string \| boolean` | `true` (`/authorize`) | The consent screen. `false` lets you put your own page at `/authorize`. |
| `settings.pages.admin` | `string \| boolean` | off | The admin screen for OAuth applications. `true` is `/admin/oauth`. |
| `settings.pages.applications` | `string \| boolean` | off | The signed-in user's applications. `true` is `/account/applications`. |
| `settings.signInPath` | `string` | the Auth login page | Where signed-out people are sent to sign in. |
| `settings.pages.scopes` | `string \| boolean` | `<admin>/scopes` | The admin screen for scopes. On when the applications screen is. `false` turns it off. |
| `settings.roleScopes` | `Record<string, string[]>` | unset | The most each role may grant to an application. Unset means no cap. |
| `settings.mcp` | `boolean` | `false` | Adds the `my-oauth-applications` MCP tool, with the permission `oauth:read`. |

**`issuer`** must be set explicitly behind a proxy.

**`keyId`** changes when you rotate the signing key.

**`accessTokenTtl`** should stay at 5 to 15 minutes when other services accept the tokens. Those services cannot revoke
a token. They can only stop a refresh. The module warns at startup when an audience is set and the lifetime is over
900 seconds.

**`refreshToken`** is the default for applications without their own session length. Each application can set
its own in the admin area ([Session lifetimes](/modules/identity/oauth-server/routes-and-clients#session-lifetimes)).

**`accessTokenAudience`** is for tokens that
[other services](/modules/identity/oauth-server/server#one-app-for-every-service) accept. ID tokens keep the
`client_id` as their audience.

**`scopes`** is where you name scopes. Pass a string, or an object
`{ name, label?, description?, icon?, service?, permissions? }`. A single word such as `tickets` is a named scope that
stands for its `permissions`. A permission such as `vouchers:read` only describes that permission on the consent screen
and groups it under its `service`. Modules add named scopes with `addScope` from `@frigear-nu/auth/utils`, and staff
add more in the admin area. Add claims for a scope with the `oauth:claims` hook. See
[Scopes](/modules/identity/oauth-server/server#scopes).

**`settings.roleScopes`** caps what each role may hand to an application, as scopes, permissions or wildcards. A user's
cap is the union over all their effective roles. A role that is not listed adds nothing. Role names are checked at build
time. See [Capping scopes by role](/modules/identity/oauth-server/server#capping-scopes-by-role).

**`cors.origins`** never takes `*`. The origins of configured clients are added for you. See
[Public applications](/modules/identity/oauth-server/routes-and-clients#public-applications).

**`cors.paths`** takes prefixes such as `['/api/']`. See [Calling from a browser on another
origin](/modules/identity/oauth-server/routes-and-clients#calling-from-a-browser-on-another-origin).

**`clients`** defines applications in config instead of in the admin area. See
[Configured clients](/modules/identity/oauth-server/routes-and-clients#configured-clients).

**`settings.pages.admin`** is registered only when [Admin](/modules/interface/admin) is installed.

### Runtime config

Keys are secrets, so they are set through runtime config, not module options.

| Runtime config | Env var | Purpose |
| --- | --- | --- |
| `oauthServer.privateKey` | `NUXT_OAUTH_SERVER_PRIVATE_KEY` | The RSA private key, as PKCS#8 PEM. Required. |
| `oauthServer.publicKey` | `NUXT_OAUTH_SERVER_PUBLIC_KEY` | Overrides the public key that is derived from the private key. |
| `oauthServer.accessTokenAudience` | `NUXT_OAUTH_SERVER_ACCESS_TOKEN_AUDIENCE` | The shared audience of access tokens, comma separated. |
| `oauthServer.corsOrigins` | `NUXT_OAUTH_SERVER_CORS_ORIGINS` | The CORS origins, comma separated. |
| `oauthServer.corsPaths` | `NUXT_OAUTH_SERVER_CORS_PATHS` | `cors.paths`, comma separated. |
| `oauthServer.refreshToken.idleTtl` | `NUXT_OAUTH_SERVER_REFRESH_TOKEN_IDLE_TTL` | `refreshToken.idleTtl` per environment, in seconds. |
| `oauthServer.refreshToken.maxAge` | `NUXT_OAUTH_SERVER_REFRESH_TOKEN_MAX_AGE` | `refreshToken.maxAge` per environment, in seconds. Empty means no cap. |
| `oauthServer.clients` | `NUXT_OAUTH_SERVER_CLIENTS` | Replaces `clients` with a JSON array of the same shape. |
| `oauthServer.previousPublicKeys` | `NUXT_OAUTH_SERVER_PREVIOUS_PUBLIC_KEYS` | Public keys of retired keys during a rotation. |

**`oauthServer.corsOrigins`** helps when the origins differ per environment, such as the dev server of a mobile app.

**`oauthServer.clients`** is validated when the first OAuth request needs it. An invalid list answers
`500 not_configured`.

**`oauthServer.previousPublicKeys`** is `{ "<kid>": "<SPKI PEM>" }`, or the same object as a JSON string.

### Signing keys

A missing or malformed signing key answers `500` with "The OAuth server signing keys are not configured."
[Signing keys](/guide/going-further/signing-keys) covers generating, storing and rotating the key.

::note
Under `nuxt dev` with no key, the module generates one into `.data/oauth-server/dev-key.pem` (mode `0600`). It reuses
that key on every restart and logs a warning. `nuxt build` never does this, so a production server without a key keeps
answering `500 not_configured`.
::

## Module pages

| Page | What it covers | For |
| --- | --- | --- |
| [Helpers](/modules/identity/oauth-server/server) | Server helpers, scopes, calling your API with an access token, one app for every service, and the composables. | App developers and module authors |
| [Hooks](/modules/identity/oauth-server/hooks) | Who may manage applications, how roles decide who signs in, what goes into tokens, vetoes, and the removed hooks. | App developers |
| [Routes and clients](/modules/identity/oauth-server/routes-and-clients) | Endpoints, introspection, how a sign-in works, public and configured applications, database and translations. | App developers and anyone connecting an app |

## Next steps

- [Create an OAuth application](/guide/going-further/oauth-application) – register the first app that signs in here.
- [Scopes](/modules/identity/oauth-server/server#scopes) – decide what applications may ask users for.
- [Hooks](/modules/identity/oauth-server/hooks) – add claims, veto access and audit tokens.
- [Authorization](/modules/identity/authorization) – roles and permissions, which decide who manages applications and what
  users may grant.
- [Identity](/guide/concepts/identity) – see where OAuth Server sits next to Auth, Mobile and OAuth Resource.
- [OAuth Resource](/modules/identity/oauth-resource) – let a separate service accept this issuer's access tokens.
