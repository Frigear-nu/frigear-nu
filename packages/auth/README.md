# @frigear-nu/auth

Authentication for the frigear ecosystem. **Signing in**: email/password, password reset, magic links, email
verification, passkeys and OAuth providers (including "Log in with frigear.nu"), with opt-in login/register pages.
**Identifying callers**: one `requireAuth` for every way a caller can authenticate: the cookie session, a static
**user API token** (`fnu_…`) and an **OAuth access token** issued to an application. Scopes narrow what a token may do,
and the owner's current role still applies.

```ts
// server/api/tickets.get.ts
const { user } = await requireAuth(event, { scopes: ['tickets:read'] })

// Account-level routes never accept bearer credentials:
const owner = await requireAuth(event, { sessionOnly: true })
```

- `requireAuth`, `getAuth` are auto-imported in server code; `@frigear-nu/users` adds `requireUser` / `getUser` for the user alone.
- Modules register scopes with `addAuthScope` and credential types with `addAuthResolver` (`@frigear-nu/auth/utils`);
  staff gates are defined with `definePolicyGate` / `defineStaffScopes`.
- Auth knows users only through an `AuthUserStore`, which `@frigear-nu/users` registers (`setAuthUserStore`);
  `@frigear-nu/oauth-server` supplies the access-token resolver.
- Sign-in is configured under `authentication.settings` (`password`, `magicLink`, `webAuthn`, `oauth`, `pages`, ...).
- Any nuxt-auth-utils OAuth provider (Auth0, Okta, Keycloak, `oidc`, ...) signs in at `/api/auth/<provider>` once its
  `NUXT_OAUTH_<PROVIDER>_*` credentials are set; `settings.oauth.<provider>` only overrides its label, icon and sign-up.
- The config key is `authentication` (`auth` belongs to nuxt-auth-utils).

See the [documentation](../../apps/docs/content/4.modules/03.auth.md) for the full model, security properties and the token API.

## Development

```bash
pnpm --filter '@frigear-nu/auth' test
```

The e2e suite uses `test/fixtures/auth-db`, whose migration is committed. After changing the schema, regenerate it as
described in the module-kit docs.
