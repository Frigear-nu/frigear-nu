# @frigear-nu/account

A module for the account area (profile, security, documents, API tokens pages) in the main frigear app. Migrated from
[`nuxt-frigear-nu`](https://github.com/Frigear-nu/nuxt-frigear-nu)'s `app/pages/account/**`.

## Features

- 👤 Update your profile details (name, avatar).
- ✉️ Change your email address.
- 🔒 Change your password.
- 🔑 Manage passkeys (via `@frigear-nu/auth`'s `usePasskeys`, when WebAuthn is enabled there).
- 🧩 Overridable composable (`useAccount`) and opt-in profile/security pages (built with [`@nuxt/ui`](https://ui.nuxt.com)).
- 🗂️ Contributes "Profile"/"Security" tiles to `@frigear-nu/menu` (when installed), and an opt-in dashboard page
  listing them.

This module is a UI shell: it owns no tables and no mutation routes. The forms call the self-service routes of
`@frigear-nu/users` (`/api/users/me/*`) and the token routes of `@frigear-nu/auth`.

## Quick Setup

Install the module to your Nuxt application with one command:

```bash
npx nuxt module add @frigear-nu/account
```

This module requires [`@frigear-nu/users`](../users) to be installed in the host app, since its forms call the
self-service routes there.

## Configuration

Configure the module via the `account` key in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/menu', // optional - enables the dashboard tiles/page
    '@frigear-nu/account',
  ],
  account: {
    settings: {
      pages: {
        profile: true, // or a custom path, e.g. '/me'
        security: true,
        // Only registered when `@frigear-nu/menu` is also installed.
        index: true,
      },
    },
  },
})
```

## API routes

- `POST /api/account/profile` - updates `name`/`avatar`.
- `POST /api/account/change-email` - updates `email` (rejects if already taken by another user).
- `POST /api/account/change-password` - verifies `currentPassword` and updates to `newPassword`.

All three require an authenticated session and re-map the updated user into it.

## Composable

```ts
const { updateProfileDetails, changeEmailAddress, changePassword, pending, error } = useAccount()

await updateProfileDetails({ name: 'Ada Lovelace' })
await changeEmailAddress({ email: 'ada@example.com' })
await changePassword({ currentPassword: 'old', newPassword: 'new-password', confirmNewPassword: 'new-password' })
```

## Translations

Strings live under the `account.*` namespace in `da`/`en` locale files and can be overridden in your app's
`i18n/locales/<code>.json`. See the [documentation](https://docs.frigear.dev/modules/account#translations).

## Overriding parts

Any `Account*` component can be replaced by a same-named component in your app (the module's have a lower priority).
`AccountHeaderRight` is the block at the right of the account header; override it to show other details.
