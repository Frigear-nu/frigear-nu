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
- ✉️ Forgot/reset password flow, dispatched through a pluggable email driver (`@frigear-nu/notify`) so the module stays dependency-free.
- 🔐 Passkey (WebAuthn) registration, authentication & credential management.
- 🪪 "Simple" OAuth routes for GitHub & Google, powered by [`nuxt-auth-utils`](https://github.com/atinux/nuxt-auth-utils). Any other provider it supports can be wired up directly in the consuming app.
- 🧩 Overridable composables (`useUserLogin`, `useUserRegistration`, `useUserPasswordReset`, `useUserPasskeys`) and opt-in login/register pages (built with [`@nuxt/ui`](https://ui.nuxt.com)).
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
      // Enable/disable the "forgot password"/"reset password" routes & composable. Requires
      // `password` to be enabled. Defaults to `true` whenever `password` is enabled.
      passwordReset: true,
      // Enable passkey (WebAuthn) registration/authentication routes, composables and DB table.
      // Requires the optional `@simplewebauthn/browser` and `@simplewebauthn/server` peer deps.
      // Defaults to `false`.
      webAuthn: false,
      // Registers the login/register pages, built with `@nuxt/ui` (an optional peer dependency,
      // required only when a page is enabled). Off by default; set to `true` for the default
      // path (`/login`, `/register`) or a custom path string to opt in.
      pages: {
        login: true,
        register: '/sign-up',
      },
      session: {
        // Path to a function (default export) mapping the raw DB user to the session user shape.
        mapper: '~/server/utils/map-session-user',
      },
      // Registers the "simple" OAuth routes we ship (`/api/auth/github`, `/api/auth/google`).
      // Each provider's client id/secret are read by nuxt-auth-utils itself from the standard
      // `NUXT_OAUTH_<PROVIDER>_CLIENT_ID` / `NUXT_OAUTH_<PROVIDER>_CLIENT_SECRET` env vars.
      // Route registration depends only on these flags. Any other provider supported by
      // nuxt-auth-utils can be added directly in the consuming app.
      oauth: {
        github: true,
        google: true,
      },
    },
  },
})
```

The password-reset email is dispatched as an `EmailNotification` through [`@frigear-nu/notify`](../notify), which this module declares as a `moduleDependency` (it's installed automatically - no need to add it to `modules` yourself). Which driver actually delivers it is an app/deployment concern, so it's configured separately, under the `notify` key:

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users'],
  notify: {
    email: {
      // Name of a built-in driver (`'log'`, the default - logs instead of sending) or a path to
      // a function (default export) matching the `EmailDriver` signature, for a real provider.
      driver: '~/server/utils/resend-email-driver',
    },
  },
})
```

```ts
// server/utils/resend-email-driver.ts
import type { EmailDriver } from '@frigear-nu/notify/types'

const sendWithResend: EmailDriver = async (notification) => {
  // ... call your provider's API with notification.to/subject/body/text
}

export default sendWithResend
```

### Routes

| Route | Enabled by | Description |
| --- | --- | --- |
| `POST /api/auth/login` | `settings.password` | Email/password login |
| `POST /api/auth/register` | `settings.password` | Email/password registration |
| `POST /api/auth/forgot-password` | `settings.passwordReset` | Request a password reset email for an `email` |
| `POST /api/auth/reset-password` | `settings.passwordReset` | Reset the password given a reset `code`, `password` & `confirmPassword`, and sign in |
| `POST /api/auth/webauthn/register` | `settings.webAuthn` | Register a new passkey |
| `POST /api/auth/webauthn/authenticate` | `settings.webAuthn` | Authenticate with a passkey |
| `GET /api/auth/webauthn/credentials` | `settings.webAuthn` | List the current user's passkeys |
| `DELETE /api/auth/webauthn/credentials/:id` | `settings.webAuthn` | Remove one of the current user's passkeys |
| `GET /api/auth/github`, `/google` | `settings.oauth.<provider>` | "Simple" OAuth login |

### Pages

| Page | Enabled by | Description |
| --- | --- | --- |
| Login | `settings.pages.login` | Renders a `UAuthForm` with the password fields and/or OAuth provider buttons that are actually enabled |
| Register | `settings.pages.register` | Renders a `UAuthForm` for name/email/password registration |

### Composables

- `useUserLogin()` / `useUserRegistration()` – wrap the password routes above, and expose `isEnabled`/`passwordLoginEnabled`/`passkeyLoginEnabled`/`oauthProviders` computed from the module's public runtime config so the shipped pages (or your own) can render conditionally.
- `useUserPasswordReset()` – wraps the forgot/reset-password routes above (`requestReset`, `resetPassword`), exposing `isEnabled` based on `settings.passwordReset`.
- `useUserPasskeys()` – wraps `useWebAuthn` for registering/authenticating/listing passkeys.

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
