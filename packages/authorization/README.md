# @frigear-nu/authorization

Policy-based authorization for the frigear ecosystem, built on [`@frigear-nu/users`](../users). Modelled on
[nuxt-authorization](https://github.com/barbapapazes/nuxt-authorization): define policies with `defineAbility`, the
current user is injected by a client/server resolver, and check with `authorize`/`allows`/`denies` or `<Can>`.

- Adds a `role` column (default `'user'`) to the `users` table - generate and commit a migration in your app.
- Route rules as keys on Nuxt's native `routeRules` (`roles`, `ability`, `guest`, `authenticated`) and per page (`definePageMeta({ authorize })`).
- Overridable user resolvers (`authorization.resolvers.server` / `.client`).

See the [documentation](../../apps/docs/content/3.modules/1.identity/4.authorization.md) for usage.
