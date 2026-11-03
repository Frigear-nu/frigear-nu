# @frigear-nu/auth

Authentication for the frigear ecosystem. **Signing in**: email/password, password reset, magic links, email
verification, passkeys and OAuth providers (including "Log in with frigear.nu"), with opt-in login/register pages.
**Identifying callers**: one `requireAuth` for every way a caller can authenticate: the cookie session, a static
**user API token** (`fnu_…` by default, `authentication.apiTokens.prefix`; `apiTokens: false` turns them off) and an **OAuth access token** issued to an application. Scopes narrow what a token may do,
and the owner's current role still applies.

```ts
// server/api/tickets.get.ts
const { user } = await requireAuth(event, { scopes: ['tickets:read'] })

// Account-level routes never accept bearer credentials:
const owner = await requireAuth(event, { sessionOnly: true })
```

- `requireAuth`, `getAuth` are auto-imported in server code; `@frigear-nu/users` adds `requireUser` / `getUser` for the user alone.
- Modules register scopes with `addAuthScope` and credential types with `addAuthResolver` (`@frigear-nu/auth/utils`);
  staff access with `defineStaffGuard({ hook, scope, message })` (`require(event, { sessionOnly? })`, `can(event, userId)`),
  built on `definePolicyGate` (`isAllowed(event, userId, extra?)`, `assert(event, userId, message?, extra?)`), and
  staff scopes with `defineStaffScopes`.
- Auth knows users only through an `AuthUserStore`, which `@frigear-nu/users` registers (`setAuthUserStore`);
  `@frigear-nu/oauth-server` supplies the access-token resolver.
- Sign-in is configured under `authentication.settings` (`password`, `magicLink`, `webAuthn`, `oauth`, `pages`, ...).
- Any nuxt-auth-utils OAuth provider (Auth0, Okta, Keycloak, `oidc`, ...) signs in at `/api/auth/<provider>` once its
  `NUXT_OAUTH_<PROVIDER>_*` credentials are set; `settings.oauth.<provider>` only overrides its label, icon and sign-up.
- The config key is `authentication` (`auth` belongs to nuxt-auth-utils).

## Client mode

`authentication.mode: 'client'` turns Auth into a public OAuth 2.1 / OpenID Connect client (PKCE) for SPAs and
Capacitor apps that sign in at an issuer: no server, no database, no nuxt-auth-utils, and `ssr: false`. It replaces
`@frigear-nu/oauth-client`, which must not be installed next to it. Set the mode in the app's own config.

```ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@frigear-nu/auth'],
  authentication: {
    mode: 'client',
    // Issuer and API also from NUXT_PUBLIC_AUTHENTICATION_CLIENT_ISSUER / _API_BASE.
    client: { issuer: 'https://frigear.nu', clientId: 'my-app', scopes: ['openid', 'profile', 'offline_access'] },
  },
})
```

- The same client API as server mode: `useUserSession()` (`loggedIn`, `user`, with `user.id` the issuer's `sub`),
  `useAuth()` (`login`, `completeLogin`, `logout`, `getAccessToken`, `signingIn`, ...) and `$api` / `useApi()`, which
  send the bearer token to `client.apiBase` and `client.apiOrigins` only.
- `scopes` must contain `openid`: the user comes from the id_token, and a sign-in without one fails.
- Login and callback pages (with `@nuxt/ui`) at `settings.pages.login` and `client.callbackPath`; branding through
  `app.config.ts` → `authentication.login`.
- Guards belong to `@frigear-nu/authorization` and are UX only: the API decides. Hooks: `auth:signed-in`,
  `auth:signed-out`, `auth:refresh-failed`, `auth:user-failed`.
- The framework-agnostic core is `@frigear-nu/auth/client-core`, the Capacitor adapters `@frigear-nu/auth/capacitor`,
  the types `@frigear-nu/auth/client-types`; `@frigear-nu/auth/mode` has `resolveAuthMode` and `isSafeRedirect` for
  other modules.

See the [documentation](../../apps/docs/content/3.modules/1.identity/1.auth/index.md) for the full model, security properties and the token API.

## Development

```bash
pnpm --filter '@frigear-nu/auth' test
```

The e2e suite uses `test/fixtures/auth-db`, whose migration is committed. After changing the schema, regenerate it as
described in the module-kit docs. The client mode's fixtures are `test/fixtures/client-*`; `--project unit` runs the
unit tests alone.
