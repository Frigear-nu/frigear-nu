---
title: OAuth Server
description: Let users sign in to your applications through an OAuth 2.0 / OpenID Connect server, with roles and claims supplied by the host app.
navigation:
  title: Overview
---

This [Nuxt module](https://nuxt.com/docs/4.x/guide/modules) turns an app into an OAuth 2.0 / OpenID Connect **server**.
You register **applications** (OAuth clients), restrict each one to users with certain roles, and those users sign in to
the application through your app: authorization code flow with mandatory PKCE, rotating refresh tokens and RS256 signed
ID tokens. The module is deliberately bare-bone: it knows nothing about roles, admins or what belongs in a token, and the
host decides through [Nitro hooks](/modules/identity/oauth-server/hooks).

:module-runtime{server client}

::note
**Requires** `@nuxthub/core`, `@frigear-nu/module-kit`, [`@frigear-nu/auth`](/modules/identity/auth),
[`@frigear-nu/users`](/modules/identity/users), [`@frigear-nu/mcp`](/modules/features/mcp) and [`@frigear-nu/ui`](/modules/interface/ui); all are
installed automatically. **Optional:** [`@frigear-nu/admin`](/modules/interface/admin) (the admin page) and
[`@frigear-nu/menu`](/modules/interface/menu) (menu items). The consent, admin and applications pages need `@nuxt/ui`.
::

## Quick setup

```bash
pnpm add @frigear-nu/oauth-server @nuxthub/core
```

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/menu', '@frigear-nu/users', '@frigear-nu/oauth-server'],
  oauthServer: {
    issuer: 'https://id.example.com',
    settings: {
      pages: { admin: true, applications: true },
    },
  },
})
```

Then:

1. [Generate a signing key](/guide/going-further/signing-keys) and set `NUXT_OAUTH_SERVER_PRIVATE_KEY`.
2. Generate and commit a migration for the `oauth_applications`, `oauth_authorization_codes` and `oauth_refresh_tokens`
   tables (see [Module Kit](/modules/platform/module-kit)). The module only adds tables; it does not change `users`.
3. Implement the [hooks](/modules/identity/oauth-server/hooks). Without them nobody is an admin and nobody has a role.

For a walkthrough of registering an application and choosing its type, see [Create an OAuth application](/guide/going-further/oauth-application).

## Options

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `issuer` | `string` | request origin | The `iss` claim and discovery issuer. Set it explicitly behind proxies. |
| `keyId` | `string` | `key-1` | `kid` of the signing key published in the JWKS. |
| `accessTokenTtl` | `number` | `900` | Access and ID token lifetime in seconds. Keep it at 5 to 15 minutes when other services accept the tokens: they cannot be revoked, only not refreshed. |
| `accessTokenAudience` | `string \| string[]` | the `client_id` | The `aud` of every access token, e.g. `frigear-services`. Set it when [other services](/modules/identity/oauth-server/server#one-app-for-every-service) accept the tokens. ID tokens keep the `client_id`. |
| `refreshToken.idleTtl` | `number` | 30 days | How long a refresh token lives unused, in seconds; every refresh starts it again. The default for applications without their own [session length](/modules/identity/oauth-server/routes-and-clients#session-lifetimes). At most two years. |
| `refreshToken.maxAge` | `number \| null` | `null` | How long a sign-in lives in total, counted from when the user signed in, however often it is refreshed. `null` = no cap. At most two years. |
| `refreshTokenTtl` | `number` | 30 days | Deprecated alias of `refreshToken.idleTtl` (warns at build time). |
| `revokeOnCredentialChange` | `boolean` | `true` | End every sign-in of a user whose password is changed or reset, or whose email changes (the `auth:credentials:changed` hook of [Auth](/modules/identity/auth/reference#hooks)). |
| `codeTtl` | `number` | `600` | Authorization code lifetime in seconds. |
| `callbackPath` | `string` | `/auth/frigear` | Appended to an application's website URL to form its redirect URI. |
| `scopes` | `Array<string \| OAuthScopeDefinition>` | `[]` | The [scope registry](/modules/identity/oauth-server/server#one-app-for-every-service): extra scopes next to `openid profile email`; enrich their claims with `oauth:claims`. Pass `{ name, label?, description?, icon?, service?, staffOnly? }` to describe one on the consent screen, group it under its service and keep it for staff. Modules add theirs with `addOAuthScope`. |
| `cors.origins` | `string[]` | `[]` | Exact origins (never `*`) that browser apps may call the token, revoke, userinfo and discovery endpoints from, e.g. `capacitor://localhost` for a [Capacitor](https://capacitorjs.com) app. The origins of [configured clients](/modules/identity/oauth-server/routes-and-clients#configured-clients) are added. See [Public clients](/modules/identity/oauth-server/routes-and-clients#public-clients). |
| `cors.paths` | `string[]` | `[]` | Path prefixes of your own API (e.g. `['/api/']`) that the same origins may call with a bearer token. See [Calling from a browser on another origin](/modules/identity/oauth-server/routes-and-clients#calling-from-a-browser-on-another-origin). |
| `clients` | `OAuthConfiguredClient[]` | `[]` | Public clients with a fixed `client_id`, defined in config instead of the admin UI. See [Configured clients](/modules/identity/oauth-server/routes-and-clients#configured-clients). |
| `settings.pages.authorize` | `string \| boolean` | `true` (`/authorize`) | Consent screen. `false` = bring your own page at `/authorize`. |
| `settings.pages.admin` | `string \| boolean` | off | Admin UI for applications. `true` = the `admin` route of Admin + `/oauth` (e.g. `/admin/oauth`). Only registered when `@frigear-nu/admin` is installed. |
| `settings.pages.applications` | `string \| boolean` | off | The signed-in user's applications. `true` = `/account/applications`. |
| `settings.signInPath` | `string` | the Auth login page | Where unauthenticated users are sent to sign in. |
| `settings.mcp` | `boolean` | `false` | Expose `my-oauth-applications` on the [MCP](/modules/features/mcp) endpoint (scope `oauth:read`). |

### Runtime config

The keys are secrets and are set through runtime config, not module options.

| Runtime config | Env var | Purpose |
| --- | --- | --- |
| `oauthServer.privateKey` | `NUXT_OAUTH_SERVER_PRIVATE_KEY` | PKCS#8 RSA private key (PEM). Required. |
| `oauthServer.publicKey` | `NUXT_OAUTH_SERVER_PUBLIC_KEY` | Overrides the public key derived from the private key. |
| `oauthServer.accessTokenAudience` | `NUXT_OAUTH_SERVER_ACCESS_TOKEN_AUDIENCE` | The shared audience of access tokens, comma separated. |
| `oauthServer.corsOrigins` | `NUXT_OAUTH_SERVER_CORS_ORIGINS` | The CORS origins as a comma separated list, when they differ per environment (for example the dev server of a mobile app). |
| `oauthServer.corsPaths` | `NUXT_OAUTH_SERVER_CORS_PATHS` | `cors.paths` as a comma separated list. |
| `oauthServer.refreshToken.idleTtl` | `NUXT_OAUTH_SERVER_REFRESH_TOKEN_IDLE_TTL` | `refreshToken.idleTtl` per environment, in seconds. |
| `oauthServer.refreshToken.maxAge` | `NUXT_OAUTH_SERVER_REFRESH_TOKEN_MAX_AGE` | `refreshToken.maxAge` per environment, in seconds (empty = no cap). |
| `oauthServer.clients` | `NUXT_OAUTH_SERVER_CLIENTS` | Replaces `clients` with a JSON array of the same shape. Validated when the first OAuth request needs it; an invalid list answers `500 not_configured`. |
| `oauthServer.previousPublicKeys` | `NUXT_OAUTH_SERVER_PREVIOUS_PUBLIC_KEYS` | Public keys of retired keys during a rotation: `{ "<kid>": "<SPKI PEM>" }`, or the same as a JSON string. |

### Signing keys

ID tokens and access tokens are signed with an RSA key (RS256), set as `NUXT_OAUTH_SERVER_PRIVATE_KEY` (PKCS#8 PEM, with
newlines written as a literal `\n`). The public half is derived from it and published at `/.well-known/jwks.json`. Use a
different key per environment. A missing or malformed key answers `500` "The OAuth server signing keys are not
configured."

Under `nuxt dev` with no key configured, the module generates one into `.data/oauth-server/dev-key.pem` (mode `0600`)
and reuses it on every restart, with a console warning. `nuxt build` never does this: a production server without a key
keeps answering `500 not_configured`.

Generating a key, storing it as a secret and rotating it without signing anyone out (`keyId` and `previousPublicKeys`)
are covered in [Signing keys](/guide/going-further/signing-keys).


## On this module

- [Server and app](/modules/identity/oauth-server/server): helpers, API access, one app for every service and the applications UI.
- [Hooks](/modules/identity/oauth-server/hooks): who is an admin, role resolution, token claims and access vetoes.
- [Routes and clients](/modules/identity/oauth-server/routes-and-clients): endpoints, sign-in flow, public and configured clients, database and translations.
