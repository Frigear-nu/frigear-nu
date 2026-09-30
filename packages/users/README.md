# @frigear-nu/users

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]
[![Nuxt][nuxt-src]][nuxt-href]

A module for managing the users in the main frigear app. for doing amazing things.

## Features

- ⛰ Manages users & their schema in teh standard frigear way.
- 🚠 Can be extended using other modules or fields on metadata
- 🌲 Simple to use, supports billing & subscriptions.
- 🔑 Email/password login & registration, with an on/off switch.
- 🔐 Passkey (WebAuthn) registration, authentication & credential management.
- 🪪 "Simple" OAuth routes for GitHub & Google, powered by [`nuxt-auth-utils`](https://github.com/atinux/nuxt-auth-utils). Any other provider it supports can be wired up directly in the consuming app.
- 🧩 Overridable composables (`useAuthLogin`, `useAuthRegister`, `useAuthPasskeys`) and opt-in login/register pages.
- 🧵 Session enrichment: the logged-in user is mapped into the session once, at login/registration time.

## Quick Setup

Install the module to your Nuxt application with one command:

```bash
npx nuxt module add @frigear-nu/users
```

That's it! You can now use @frigear-nu/users in your Nuxt app ✨

This module requires [`@nuxthub/core`](https://hub.nuxt.com) to be configured in the host app, since it relies on it for
the `users` (and, when WebAuthn is enabled, `user_credentials`) database table.

## Configuration

Configure the module via the `users` key in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users'],
  users: {
    mode: 'server',
    settings: {
      // Enable/disable email + password login & register routes, composables and pages.
      // Defaults to `true`.
      password: true,
      // Enable passkey (WebAuthn) registration/authentication routes, composables and DB table.
      // Requires the optional `@simplewebauthn/browser` and `@simplewebauthn/server` peer deps.
      // Defaults to `false`.
      webAuthn: false,
      // Registers the login/register pages (`/login`, `/register`). Off by default, since it
      // switches the consuming app into Vue Router's "pages" mode. Set to `true` to opt in.
      pages: false,
      session: {
        // Path to a function (default export) mapping the raw DB user to the session user shape.
        mapper: '~/server/utils/map-session-user',
      },
      // Registers the "simple" OAuth routes we ship (`/api/auth/github`, `/api/auth/google`).
      // Each provider's client id/secret are read by nuxt-auth-utils itself from the standard
      // `NUXT_OAUTH_<PROVIDER>_CLIENT_ID` / `NUXT_OAUTH_<PROVIDER>_CLIENT_SECRET` env vars - the
      // route is only registered when both are set. Any other provider supported by
      // nuxt-auth-utils can be added directly in the consuming app.
      oauth: {
        github: true,
        google: true,
      },
    },
  },
})
```

### Routes

| Route | Enabled by | Description |
| --- | --- | --- |
| `POST /api/auth/login` | `settings.password` | Email/password login |
| `POST /api/auth/register` | `settings.password` | Email/password registration |
| `POST /api/auth/webauthn/register` | `settings.webAuthn` | Register a new passkey |
| `POST /api/auth/webauthn/authenticate` | `settings.webAuthn` | Authenticate with a passkey |
| `GET /api/auth/webauthn/credentials` | `settings.webAuthn` | List the current user's passkeys |
| `DELETE /api/auth/webauthn/credentials/:id` | `settings.webAuthn` | Remove one of the current user's passkeys |
| `GET /api/auth/github`, `/google` | `settings.oauth.<provider>` + matching env vars | "Simple" OAuth login |

### Composables

- `useAuthLogin()` / `useAuthRegister()` – wrap the password routes above.
- `useAuthPasskeys()` – wraps `useWebAuthn` for registering/authenticating/listing passkeys.

All composables are registered via Nuxt's import ecosystem, so they can be overridden by re-declaring a composable of
the same name in the consuming app.


## Contribution

<details>
  <summary>Local development</summary>
  
  ```bash
  # Install dependencies
  npm install
  
  # Generate type stubs
  npm run dev:prepare
  
  # Develop with the playground
  npm run dev
  
  # Build the playground
  npm run dev:build
  
  # Run ESLint
  npm run lint
  
  # Run Vitest
  npm run test
  npm run test:watch
  
  # Release new version
  npm run release
  ```

</details>


<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/@frigear-nu/users/latest.svg?style=flat&colorA=020420&colorB=00DC82
[npm-version-href]: https://npmjs.com/package/@frigear-nu/users

[npm-downloads-src]: https://img.shields.io/npm/dm/@frigear-nu/users.svg?style=flat&colorA=020420&colorB=00DC82
[npm-downloads-href]: https://npm.chart.dev/@frigear-nu/users

[license-src]: https://img.shields.io/npm/l/@frigear-nu/users.svg?style=flat&colorA=020420&colorB=00DC82
[license-href]: https://npmjs.com/package/@frigear-nu/users

[nuxt-src]: https://img.shields.io/badge/Nuxt-020420?logo=nuxt
[nuxt-href]: https://nuxt.com
