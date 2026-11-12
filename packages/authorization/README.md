# @frigear-nu/authorization

Roles, role assignment and the roles admin, plus the client side of access control, built on the permission engine of
[`@frigear-nu/auth`](../auth) (server mode, with [`@frigear-nu/users`](../users)) or on Auth alone in client mode.

- Server mode: roles (`authorization.roles`: `grant`, `inherit`, `requirements`, `auto`) compiled by Auth, assignments in
  `authorization_user_roles` (generate and commit a migration in your app), and the roles admin
  (`/api/admin/authorization/**`, `roles:read` / `roles:assign`).
- Client: `useAuthorization()` (`access`, a synchronous `can` / `cannot`, `authorize`, `refresh`), `<Can>` / `<Cannot>`,
  and filters that hide menu items, widgets and tabs whose `permission` the viewer lacks. `access` comes from
  `GET /api/auth/me/access`; in client mode (`authentication.mode: 'client'`, such as `@frigear-nu/mobile`) from the
  issuer's `/api/auth/me/access` with the bearer token, falling back to the access token's `permissions` claim. Every
  client-side check is UI only: the API decides what is allowed.
- Route rules as keys on Nuxt's native `routeRules` (`permission`, `authenticated`, `guest`) and per page
  (`definePageMeta({ authorize })`, `authorize: false` opens a page). Auth's anonymous sign-in pages and endpoints are
  always exempt from less specific rules (`'/**': { authenticated: true }`).

See the [documentation](../../apps/docs/content/3.modules/1.identity/4.authorization.md) for usage.
