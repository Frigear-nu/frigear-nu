# @frigear-nu/oauth-server

An OAuth 2.0 / OpenID Connect server for the frigear ecosystem. Register **applications**, restrict them to users
with certain roles, and let those users sign in to them through your app (authorization code flow with PKCE, rotating
refresh tokens, RS256 ID tokens, RFC 7662 introspection). Who may manage applications and which scopes a user may
grant follow the access control of `@frigear-nu/auth` (permissions, roles from `@frigear-nu/authorization`); extra
claims come from the `oauth:claims` Nitro hook.

## Quick Setup

Requires `@nuxthub/core` and `@frigear-nu/users` (server mode). `@frigear-nu/menu` (account tiles) and `@nuxt/ui`
(the shipped pages) are optional.

```ts
export default defineNuxtConfig({
  modules: ['@frigear-nu/menu', '@frigear-nu/users', '@frigear-nu/oauth-server'],
  oauthServer: {
    issuer: 'https://id.example.com',
    settings: { pages: { admin: true, applications: true } },
  },
})
```

Create a signing key and expose it through the environment (the public key is derived from it):

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 | awk 'NF {printf "%s\\n", $0}'
# NUXT_OAUTH_SERVER_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
```

Generate and commit a migration for the `oauth_*` tables in your app (see the repository `AGENTS.md`).

Managing applications and scopes needs the session-only `oauth:manage` permission (given to the `admin` role by
default). Scopes are OIDC scopes, every permission a token may hold, and named scopes: from `oauthServer.scopes`,
modules (`addScope` of `@frigear-nu/auth`) and the scopes admin. Cap what each role may grant to clients:

```ts
oauthServer: {
  scopes: [{ name: 'tickets', label: 'Your tickets', permissions: ['tickets:read', 'tickets:write'] }],
  settings: { roleScopes: { admin: ['*'], user: ['openid', 'profile', 'email', 'tickets'] } },
}
```

Access tokens carry a `permissions` claim, frozen at issue. An unknown scope at `/oauth/authorize` is answered with
`invalid_scope`; a known scope the user may not grant is shown as unavailable on the consent screen.

Migrating from an earlier release: `addOAuthScope` is gone (use `addScope` from `@frigear-nu/auth/utils`, or
`addPermission` for a `resource:action` scope), as are `staffOnly` and the `oauth:authorize`, `oauth:scope:staff` and
`oauth:user:roles` hooks (use `oauth:manage`, permissions and roles; `allowedRoles` match effective roles).

Full documentation with examples: `apps/docs/content/3.modules/1.identity/6.oauth-server/index.md`.

## Development

```bash
pnpm --filter @frigear-nu/oauth-server test
pnpm --filter @frigear-nu/oauth-server lint
pnpm --filter @frigear-nu/oauth-server dev
```
