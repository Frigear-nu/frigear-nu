# @frigear-nu/users

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

The user entity of the main frigear app: the `users` table, staff administration of users, and what a signed-in user can
change about themselves. How people sign in lives in [`@frigear-nu/auth`](../auth), which this module installs.

## Features

- ⛰ The `users` table and its schema, extended by other modules (credentials by `auth`, `role` by `authorization`, ...).
- 🛠 Staff administration (`settings.admin`): list, create, edit, delete and re-invite users, a "new members" widget and
  an admin page (with `@frigear-nu/admin`). Policy is the host's, through the `users:admin:authorize` hook.
- 🧑 Self-service: change profile, email (optionally confirmed from the inbox) and password.
- 🧩 `requireUser` / `getUser` for server routes, and `extendUsersAdmin` for modules that add to the admin user page.
- 🔌 Registers the user store `@frigear-nu/auth` reads and writes users through.

## Quick Setup

```bash
npx nuxt module add @frigear-nu/users
```

This module requires [`@nuxthub/core`](https://hub.nuxt.com) in the host app. Generate and commit a migration for the
tables it contributes (see the module-kit migrations guide).

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users'],
  users: {
    settings: {
      admin: true, // staff administration; `{ page: false }` = API only
      verifyEmailChange: true, // a new address must be confirmed from its inbox
      profilePath: '/account/profile', // where that confirmation lands
      mcp: false, // the `get-my-profile` MCP tool
    },
  },
})
```

See the [documentation](../../apps/docs/content/4.modules/10.users.md) for the routes, hooks and the user page extension
points, and [`@frigear-nu/auth`](../auth/README.md) for sign-in (`authentication.settings`).

## Development

```bash
pnpm --filter '@frigear-nu/users' test
```

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@frigear-nu/users/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/@frigear-nu/users

[npm-downloads-src]: https://img.shields.io/npm/dm/@frigear-nu/users.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/@frigear-nu/users

[license-src]: https://img.shields.io/npm/l/@frigear-nu/users.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/@frigear-nu/users

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt
[nuxt-href]: https://nuxt.com
