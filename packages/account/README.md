# @frigear-nu/account

A module for the account area (profile, email, password, security) in the main frigear app. Migrated from
[`nuxt-frigear-nu`](https://github.com/Frigear-nu/nuxt-frigear-nu)'s `app/pages/account/**`.

## Features

- 👤 Update your profile details (name, avatar).
- ✉️ Change your email address.
- 🔒 Change your password.
- 🔑 Manage passkeys (via `@frigear-nu/users`' `useUserPasskeys`, when WebAuthn is enabled there).
- 🧩 Overridable composable (`useAccount`) and opt-in profile/security pages (built with [`@nuxt/ui`](https://ui.nuxt.com)).
- 🗂️ Contributes "Profile"/"Security" tiles to `@frigear-nu/navigation` (when installed), and an opt-in dashboard page
  listing them.

This module reuses `@frigear-nu/users`' session/password utilities instead of registering its own `users` database
table or duplicating auth logic - it only adds the account-management routes that didn't already exist there.

## Quick Setup

Install the module to your Nuxt application with one command:

```bash
npx nuxt module add @frigear-nu/account
```

This module requires [`@frigear-nu/users`](../users) to be installed in the host app, since it updates the same
`users` database table and reuses its session helpers (`mapUserToSession`, `hashPassword`/`verifyPassword`).

## Configuration

Configure the module via the `account` key in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/navigation', // optional - enables the dashboard tiles/page
    '@frigear-nu/account',
  ],
  account: {
    settings: {
      pages: {
        profile: true, // or a custom path, e.g. '/me'
        security: true,
        // Only registered when `@frigear-nu/navigation` is also installed.
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
