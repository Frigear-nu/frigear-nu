# @frigear-nu/oauth-client

> [!WARNING]
> **Deprecated.** This package is frozen: it gets no new features. Use [`@frigear-nu/auth`](../auth) in client mode
> (`authentication: { mode: 'client', client: { ... } }`), which has the same PKCE client, one `useUserSession()` /
> `useAuth()` / `$api` API for web and mobile apps, and guards from `@frigear-nu/authorization`. Auth refuses to run
> next to this package. Migration guide: https://docs.frigear.dev/modules/identity/auth/client-mode

OAuth 2.1 / OpenID Connect **public client with PKCE** for Nuxt apps that run in the browser (SPAs) or inside a
Capacitor webview, plus a framework-agnostic core for anything else that has `fetch` and WebCrypto.

It works with [`@frigear-nu/oauth-server`](../oauth-server) and with any standards compliant OpenID Connect provider
(Keycloak, Auth0, Zitadel, Authentik, ...).

- Authorization code + PKCE (S256), `state`, `nonce`, RFC 9207 `iss` check, no client secret
- OIDC discovery (`openid-configuration`, falling back to RFC 8414), issuer and S256 checks, cached
- Rotating refresh tokens done safely: one refresh at a time (single-flight in the page, Web Locks across tabs), storage
  re-read under the lock so a tab never reuses a rotated token, a non-rotated refresh token is kept
- Errors by kind: `session` (only an explicit `invalid_grant` and friends: signed out), `config` (`invalid_client`,
  issuer mismatch), `transient` (network, timeouts, 429, 5xx, a 4xx without an OAuth error body: the session is kept),
  `authorization` (failed sign-in)
- Every request to the authorization server times out (`requestTimeoutSeconds`, default 15)
- id_token checks (`iss`, `aud`/`azp`, `sub`, `nonce`; not the device clock). A refreshed id_token that fails them
  keeps the previous claims; the rotated tokens are always stored
- Pending sign-ins keyed by `state`: a forged callback is ignored and never cancels a real sign-in, and two tabs can
  sign in at once
- Keychain / Keystore token storage on a device, with an install marker that wipes tokens surviving a reinstall
- `$api` / `useApi()` with the bearer token for allowed origins only and one forced refresh on 401
- `/login` and `/auth/callback` pages (with `@nuxt/ui`; a page of the app at the same path wins)

For a server-rendered web app with its own users, use `@frigear-nu/auth` (SSO) instead: this client keeps tokens in
the browser, so the server cannot know who is signed in.

## Setup

```bash
pnpm add @frigear-nu/oauth-client
# inside a Capacitor app also:
pnpm add @capacitor/app @capacitor/browser @capacitor/preferences @aparajita/capacitor-secure-storage
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@frigear-nu/oauth-client'],
  ssr: false,
  oauthClient: {
    issuer: 'https://frigear.nu',
    clientId: 'my-app',
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    apiBase: 'https://api.example.com', // default: the issuer
    native: { scheme: 'com.example.app' }, // → redirect URI com.example.app:/auth/callback
    protect: 'all',
  },
})
```

Register a **public** client at the issuer with these exact redirect URIs:

- browser: `<origin>/auth/callback` (e.g. `http://localhost:3000/auth/callback`)
- native: `<scheme in lowercase>:/auth/callback` (e.g. `com.example.app:/auth/callback`)

and allow the app's origins for CORS on the token, revoke and userinfo endpoints (`capacitor://localhost`,
`https://localhost`, your dev origin).

### Environment

Runtime config lives in `runtimeConfig.public.oauthClient`; the host's own values win over the module options.

| Variable | Key |
|---|---|
| `NUXT_PUBLIC_OAUTH_CLIENT_ISSUER` | `issuer` |
| `NUXT_PUBLIC_OAUTH_CLIENT_CLIENT_ID` | `clientId` |
| `NUXT_PUBLIC_OAUTH_CLIENT_SCOPE` | `scope` (space separated) |
| `NUXT_PUBLIC_OAUTH_CLIENT_API_BASE` | `apiBase` |
| `NUXT_PUBLIC_OAUTH_CLIENT_REDIRECT_URI` | `redirectUri` (browser) |
| `NUXT_PUBLIC_OAUTH_CLIENT_NATIVE_REDIRECT_URI` | `nativeRedirectUri` |

`NUXT_PUBLIC_OAUTH_CLIENT_SECRET` is for `nuxt dev` against a confidential client only: a production build that would
embed a secret fails (`allowClientSecretInBundle: true` to override for throwaway builds), and outside development
`clientSecret` is not declared at all, so a runtime env var cannot leak into server-rendered pages.

Lists the host sets in `runtimeConfig.public.oauthClient` (`publicPaths`, `api.attachTo`) replace the module's.

## Options

| Option | Default | |
|---|---|---|
| `issuer`, `clientId` | | required (options or env) |
| `scopes` | `['openid']` | add `offline_access` for refresh tokens where the provider needs it |
| `apiBase` | issuer | base URL of `$api` / `useApi` |
| `redirectUri` | `<origin><callbackPath>` | browser redirect URI |
| `callbackPath` | `/auth/callback` | |
| `native.scheme` / `native.redirectUri` | | native redirect URI; an invalid scheme (e.g. with `_`) fails the build |
| `endpoints` | discovered | `authorization`, `token`, `revocation`, `userinfo`, ... override discovery |
| `discovery` | `true` | `false`: the oauth-server paths (`/oauth/authorize`, ...) |
| `authorizationParams` | `{}` | `prompt`, `audience`, ... |
| `storage` | `auto` | `auto` \| `secure` \| `preferences` \| `local` \| `session` \| `memory` \| a file path |
| `pages.login` / `pages.callback` | `true` | needs `@nuxt/ui`; `pages.login: '/sign-in'` for another path |
| `protect` | `none` | `all`: every page needs a signed-in user except `publicPaths`, the login and callback pages |
| `publicPaths` | `[]` | `'/docs/**'` matches `/docs` and below |
| `redirect.login` / `afterLogin` / `afterLogout` | `/login` / `/` / login page with `protect: 'all'`, else `/` | |
| `api.attachTo` | `apiBase` and issuer origins | origins that get the bearer token |
| `api.onUnauthorized` | `signOut` | what a 401 surviving a forced refresh does |
| `dev.rewriteLoopback` | `true` | in dev on a device, `localhost` in issuer/apiBase → the dev machine's host; a string sets the host |
| `allowClientSecretInBundle` | `false` | |

With `storage: 'auto'`, an app that has `@capacitor/core` installed but not `@aparajita/capacitor-secure-storage`
fails a production build (tokens would sit unencrypted in UserDefaults/SharedPreferences); set `storage: 'preferences'`
to accept that. A file path's default export is a `TokenStorage` or a function returning one.

Branding of the login page goes in `app.config.ts`:

```ts
export default defineAppConfig({
  oauthClient: { login: { title: 'Household bills', description: '...', logo: '/logo.svg' } },
})
```

## In the app

```ts
const { status, authenticated, claims, signingIn, login, logout, getAccessToken, isCallbackUrl } = useOAuth()
const { data } = await useApi<Bill[]>('/api/bills') // client only (`server: false`) by default
const me = await useNuxtApp().$api<User>('/api/me')
```

- `definePageMeta({ oauth: false })` makes a page public with `protect: 'all'`; `oauth: true` protects one with
  `protect: 'none'`.
- `<OAuthSignInButton return-to="/bills" />` (with `@nuxt/ui`).
- Runtime hooks: `oauth:signed-in`, `oauth:signed-out` (`{ reason }`), `oauth:refresh-failed` (`{ error }`).
- Inside a native app the plugin completes sign-ins from the cold-start URL (`App.getLaunchUrl()`) and from
  `appUrlOpen` (callback URLs only; other deep links are left alone), and refreshes on `resume`.
- With SSR on, the server renders signed out (`status: 'unknown'`); render signed-in content with `ssr: false` or
  inside `<ClientOnly>` to avoid hydration mismatches.

## Without Nuxt

```ts
import { createOAuthClient, webStorage } from '@frigear-nu/oauth-client/core'

const client = createOAuthClient({
  issuer: 'https://frigear.nu',
  clientId: 'my-app',
  redirectUri: `${location.origin}/callback`,
  scope: 'openid offline_access',
  storage: webStorage(),
  attachTo: ['https://api.example.com'],
})
await client.authorize() // redirects
// on /callback:
const { returnTo } = await client.handleCallback(location.href)
// bearer only for `attachTo` origins (default: the issuer), refresh + retry on 401
const response = await client.fetch('https://api.example.com/me')
```

A Capacitor app without Nuxt:

```ts
import { SecureStorage } from '@aparajita/capacitor-secure-storage'
import { createCapacitorOAuthClient, onCapacitorCallback } from '@frigear-nu/oauth-client/capacitor'

const client = createCapacitorOAuthClient({ issuer, clientId, redirectUri: 'com.example.app:/auth/callback', secureStorage: SecureStorage })
await onCapacitorCallback({
  isCallbackUrl: url => client.isCallbackUrl(url),
  // Ignore links that answer no sign-in we started.
  onCallback: async url => (await client.matchesPendingAuthorization(url)) && client.handleCallback(url),
  launchUrlStore: { get: () => sessionStorage.getItem('launch'), set: url => sessionStorage.setItem('launch', url) },
})
```

`TokenStorage` (`get`/`set`/`remove`, async) and `AuthorizationUserAgent` (`open(url, { redirectUri, onDismissed })`,
`close()`) are the extension points: swap in another secure storage, or an ASWebAuthenticationSession user agent.

id_token signatures are not verified: the client receives the token directly from the issuer's token endpoint over
TLS (OpenID Connect Core 3.1.3.7). Resource servers must verify access tokens themselves.

## Development

```bash
pnpm --filter @frigear-nu/oauth-client lint
pnpm --filter @frigear-nu/oauth-client test        # unit, fake-issuer integration, e2e fixtures
pnpm --filter @frigear-nu/oauth-client test:types
```
