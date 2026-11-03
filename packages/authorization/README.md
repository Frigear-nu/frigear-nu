# @frigear-nu/authorization

Policy-based authorization for the frigear ecosystem, built on [`@frigear-nu/users`](../users) (server mode) or on
[`@frigear-nu/auth`](../auth) alone in client mode. Modelled on
[nuxt-authorization](https://github.com/barbapapazes/nuxt-authorization): define policies with `defineAbility`, the
current user is injected by a client/server resolver, and check with `authorize`/`allows`/`denies` or `<Can>`.

- Server mode: adds a `role` column (default `'user'`) to the `users` table - generate and commit a migration in your
  app. Client mode (`authentication.mode: 'client'`): no server, no database; the rules only decide what the app shows
  (the API decides what is allowed), and `role` comes from the id_token's `role` claim, when there is one.
- Route rules as keys on Nuxt's native `routeRules` (`roles`, `ability`, `guest`, `authenticated`) and per page
  (`definePageMeta({ authorize })`, `authorize: false` opens a page). Auth's anonymous sign-in pages and endpoints are
  always exempt from less specific rules (`'/**': { authenticated: true }`).
- Overridable user resolvers (`authorization.resolvers.server` / `.client`).

See the [documentation](../../apps/docs/content/3.modules/1.identity/4.authorization.md) for usage.
