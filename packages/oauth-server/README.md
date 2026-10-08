# @frigear-nu/oauth-server

An OAuth 2.0 / OpenID Connect server for the frigear ecosystem. Register **applications**, restrict them to users
with certain roles, and let those users sign in to them through your app (authorization code flow with PKCE, rotating
refresh tokens, RS256 ID tokens). The module stays bare-bone: roles, the admin gate and extra claims are supplied by the
consuming app through Nitro hooks.

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

Generate and commit a migration for the three `oauth_*` tables in your app (see the repository `AGENTS.md`).

Nobody can manage applications or hold a role until the host says so:

```ts
// server/plugins/oauth.ts
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('oauth:authorize', async (ctx) => { ctx.allowed = await isStaff(ctx.userId) })
  nitro.hooks.hook('oauth:user:roles', async (ctx) => { ctx.roles.push(...await rolesFor(ctx.userId)) })
})
```

Full documentation with examples: `apps/docs/content/4.modules/500.oauth-server.md`.

## Development

```bash
pnpm --filter @frigear-nu/oauth-server test
pnpm --filter @frigear-nu/oauth-server lint
pnpm --filter @frigear-nu/oauth-server dev
```
