# @frigear-nu/auth

One `requireUser` for every way a caller can authenticate: the cookie session, a static **user API token** (`fnu_…`) and an
**OAuth access token** issued to an application. Scopes narrow what a token may do, and the owner's current role still
applies.

```ts
// server/api/tickets.get.ts
const user = await requireUser(event, { scopes: ['tickets:read'] })

// Account-level routes never accept bearer credentials:
const owner = await requireUser(event, { sessionOnly: true })
```

- `requireUser`, `requireAuth`, `getAuth`, `getAuthUser` are auto-imported in server code.
- Modules register scopes with `addAuthScope` and credential types with `addAuthResolver` (`@frigear-nu/auth/utils`).
- `@frigear-nu/users` supplies the user loader, `@frigear-nu/oauth-server` the access-token resolver.
- The config key is `authentication` (`auth` belongs to nuxt-auth-utils).

See the [documentation](../../apps/docs/content/4.modules/9.auth.md) for the full model, security properties and the token API.

## Development

```bash
pnpm --filter '@frigear-nu/auth' test
```

The e2e suite uses `test/fixtures/auth-db`, whose migration is committed. After changing the schema, regenerate it as
described in the module-kit docs.
