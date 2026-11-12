---
title: Auth
description: Lets people sign in to your app and tells every server route who is calling and what they may do.
navigation:
  title: Overview
---

Auth lets people sign in to your app with a password, an emailed link, a passkey or an account at GitHub, Google or
another provider. It also tells every server route who is calling, whether that is a browser, a script or another app.
Install it when your app has users; [Users](/modules/identity/users) installs it for you. To let other apps sign in
through yours, add [OAuth Server](/modules/identity/oauth-server) as well.

The package is `@frigear-nu/auth`. It runs in [server mode](/guide/concepts/glossary) by default: people sign in on your
app's own server and stay signed in through a cookie [session](/guide/concepts/glossary). An app without a server of
its own, such as a single-page application (SPA) or a Capacitor app, uses
[client mode](/modules/identity/auth/client-mode).

## What you get

- **Pages** (opt-in, need `@nuxt/ui`): a sign-in page (`/login`), a sign-up page (`/register`), `/forgot-password` and
  `/reset-password`, and `/auth/magic-link` for emailed links.
- **Server routes** under `/api/auth`: password sign-in and sign-up (on by default), password reset (on with
  passwords), emailed sign-in links and passkeys (opt-in), and sign-in through an
  [OAuth provider](/guide/concepts/glossary) (on once its credentials are set). See
  [Routes](/modules/identity/auth/reference#routes).
- **API tokens** (on by default): users create long-lived [API tokens](/guide/concepts/glossary) for scripts and
  agents, on the [Account](/modules/identity/account) page or through the API.
- **Composables and helpers**: on the server, `authorize` decides whether the caller may do something and `getAuth` tells a route who is calling (see
  [Server API](/modules/identity/auth/server)). In the app, `useUserSession()` says who is signed in, `useAuth()` holds
  the sign-in and sign-out actions, and `$api` / `useApi()` call your API. The same names work in both modes. Roles
  and the guards of the interface come from [Authorization](/modules/identity/authorization) in both.
- **Emails**: the emailed sign-in link, address verification and password reset, sent through
  [Notify](/modules/platform/notify) when those flows are on.

:module-runtime{server client mobile}

::note
**Installed for you:** in server mode, `@frigear-nu/module-kit`, [`@frigear-nu/notify`](/modules/platform/notify) and
`nuxt-auth-utils`; in client mode, `@frigear-nu/module-kit` only.

**You add:** `@nuxthub/core` in server mode.

**Optional:** [`@frigear-nu/menu`](/modules/interface/menu) (the sign-out item), `@nuxt/ui` (the shipped pages),
`@simplewebauthn/browser` and `@simplewebauthn/server` (passkeys), and
[`@frigear-nu/email-templates`](/modules/platform/email-templates) (rendered emails).
::

## Quick setup

::steps

### Install Auth

[Users](/modules/identity/users) installs Auth for you. Add it yourself only when you use it without Users:

```bash
pnpm add @frigear-nu/auth @nuxthub/core
```

### Add it to nuxt.config.ts

:::warning
The config key is `authentication`, not `auth`. The `auth` key belongs to nuxt-auth-utils.
:::

This turns on password sign-in with a sign-in page at `/login` and a sign-up page at `/sign-up`:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/auth', // omit when Users is installed
  ],
  authentication: {
    settings: {
      password: true,
      pages: { login: true, register: '/sign-up' },
    },
  },
})
```

### Generate the migration

:::warning
Without a [migration](/guide/concepts/glossary), sign-up and API tokens fail, because the database lacks Auth's columns
and tables.
:::

Auth adds its own tables and adds sign-in columns to the `users` table of Users (see
[Database](/modules/identity/auth/reference#database)). That only changes the generated Drizzle schema, so generate a
migration and commit it:

```bash
pnpm db:generate
```

Module authors do the same in every [test fixture](/guide/concepts/glossary) that installs Auth. See
[Database](/get-started/database#migrations) and [Module Kit](/modules/platform/module-kit).

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** `/login` shows an email and password form. After you create an account at `/sign-up`, you are
signed in.
::

## Options

Options go under the `authentication` key.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `mode` | `'server' \| 'client'` | `'server'` | Server mode or [client mode](/modules/identity/auth/client-mode). |
| `client` | `ClientModuleOptions` | – | Client mode only: the issuer and how the app talks to it. |
| `apiTokens` | `boolean \| { prefix?: string }` | `true` | API tokens. `false` turns them off. |
| `apiTokens.prefix` | `string` | `'fnu_'` | What new API tokens start with. See [API tokens](/modules/identity/auth/server#user-api-tokens). |
| `apiTokens.revokeOnReset` | `boolean` | `true` | Revoke a user's API tokens when their password is reset by email or an email change is undone. |
| `tokenTtlDays` | `number \| null` | `null` | Default lifetime of new API tokens. `null` means they never expire. |
| `userStore` | `string` | the one from Users | Path to a module whose default export is an `AuthUserStore`. |
| `settings.password` | `boolean` | `true` | Email and password sign-in and sign-up: routes, composables and pages. |
| `settings.passwordReset` | `boolean \| { cooldown? }` | `true` with `password` | Forgot and reset password routes. Needs `password`. |
| `settings.passwordReset.cooldown` | `number` | `60` | Minimum seconds between two reset emails for one user. |
| `settings.webAuthn` | `boolean` | `false` | Passkeys: routes, composables and a table. |
| `settings.magicLink` | `boolean \| { signUp?, cooldown? }` | off | An emailed single-use sign-in link. Following it verifies the address, and clears what was set on an unverified account. |
| `settings.magicLink.signUp` | `boolean` | – | `true` creates accounts for unknown addresses. |
| `settings.magicLink.cooldown` | `number` | `60` | Minimum seconds between two links for one user. |
| `settings.verifyEmail` | `boolean` | `false` | Users verify their address before they can sign in, with a password or a passkey. |
| `settings.rateLimit` | `false \| { … }` | on | Throttles the anonymous sign-in routes, counted in NuxtHub KV. See below. |
| `settings.cleanup` | `string \| false` | `'0 3 * * *'` | When the `auth:clear-expired-tokens` task removes expired links and resets. |
| `settings.pages.login` | `string \| boolean` | off | The sign-in page. `true` means `/login`. |
| `settings.pages.register` | `string \| boolean` | off | The sign-up page. `true` means `/register`. May be an absolute URL. |
| `settings.pages.callback` | `boolean` | `true` | Client mode only: the callback page. |
| `settings.afterLogin` | `string` | `'/'` | Where users land after signing in. |
| `settings.siteUrl` | `string` | `NUXT_SITE_URL` | The public URL emailed links point at. Becomes `runtimeConfig.public.siteUrl` (`NUXT_PUBLIC_SITE_URL`). |
| `settings.trustRequestOrigin` | `boolean` | `false` | Without a site URL, build emailed links from the request's origin in production too. |
| `settings.session.mapper` | `string` | pass-through | Path to a default-export function that maps the stored user to the session user. |
| `settings.session.maxAge` | `number \| false` | `2592000` (30 days) | How long a session lasts, in seconds from sign-in. `false` turns the limit off. |
| `settings.oauth` | `Record<provider, boolean \| { … }>` | `{}` | Changes per OAuth provider. `false` keeps one off. |

**`settings.siteUrl`.** Password reset, magic link and verification emails (and the email change emails of
[Users](/modules/identity/users)) link to this URL, never to the request's `Host` header, which the client chooses.
Set `NUXT_PUBLIC_SITE_URL` in production. Without it those emails fail with `500 site_url_missing`, and the server warns
at startup. `nuxt dev` uses the request's origin. Turn on `settings.trustRequestOrigin` only on a platform that routes
by host, so a request for another host never reaches the app, such as Cloudflare Workers.

Sign-in, sign-up, sign-out, the magic link confirmation and the password reset refuse requests that another site made
the browser send: `Sec-Fetch-Site: cross-site`, or an `Origin` other than the request's host or the site URL. They
answer `403 cross_site_request`. Clients that send neither header, such as native apps and servers, are not affected.

**`settings.session.maxAge`.** A session ends this long after sign-in, however active the user is: the cookie expires,
and the server refuses a session signed in earlier (it is stamped at sign-in, and saving the profile or a preference
keeps the stamp). Signing in again starts a new one. nuxt-auth-utils'
`runtimeConfig.session.maxAge` (`NUXT_SESSION_MAX_AGE`) wins over this setting.

**Ending sessions.** A password change or reset, an email change or its revert, and clearing an unverified account's
credentials end every other session of the user: the module bumps the user's `sessionVersion` column, and a session
signed in before that is refused. The session that made the change stays signed in. A password reset and an undone email
change also revoke the user's API tokens, since the account may have been in someone else's hands. Set
`apiTokens.revokeOnReset: false` to keep them, for example when integrations must not break.

**`settings.rateLimit`.** Past a limit the route answers `429 rate_limited` with a `retry-after` header. The counters
live in NuxtHub KV: without `hub.kv` nothing is throttled and the build warns. Throttling is off under `nuxt dev`. `0`
turns one limit off, `false` all of them.

| Option | Default | Counts |
| --- | --- | --- |
| `windowSeconds` | `900` | The length of the fixed window. |
| `login` | `10` | Failed password sign-ins per client IP and account. |
| `loginIp` | `100` | Failed password sign-ins per client IP, for any account. |
| `requests` | `30` | Requests per client IP to each of register, forgot password, magic link and the passkey options. |
| `ipHeader` | `cf-connecting-ip` on Cloudflare | The header holding the client IP. Otherwise the socket address is used. |
| `xForwardedFor` | `false` | Read the client IP from `X-Forwarded-For`. Only behind a proxy that overwrites it. |

A sign-in for an unknown account checks a password all the same, so it answers as slowly as a wrong password.

**`mode`.** Set it in your app's own `nuxt.config`. A mode from inline module options or from another module's
default fails the build.

**`settings.verifyEmail`.** The address is verified through an emailed link. Signing up creates no session. Passkey
sign-in to an unverified account answers `403 email_not_verified`, like password sign-in. A passkey proves nothing
about the address, so signing up with one is refused (`403 email_verification_required`): sign up with a password or an
emailed link first, then add the passkey from the account.

**`settings.cleanup`.** `false` schedules nothing. The task stays registered, so you can run it yourself.

**`settings.pages.login`.** With it, the module also registers `/forgot-password` and `/reset-password` (when
`passwordReset` is on). The sign-in page shows only the controls that are on: the password form, passkeys, the emailed
link and OAuth buttons.

**`settings.pages.register`.** An absolute URL adds no local page. The sign-in page links to that URL instead.

**`settings.afterLogin`.** It applies after every kind of sign-in: password, passkey, emailed link and OAuth provider.
It must be an absolute path on this site. A `?redirect=` on the sign-in page or on `/api/auth/<provider>` takes
precedence.

**`settings.oauth`.** Providers, Sign in with frigear.nu and keeping provider tokens are on
[OAuth providers](/modules/identity/auth/oauth-providers).

### Why the sign-in page opened

The sign-in page may be opened with `?redirect=`, for example by the `redirectTo` option of
[Authorization](/modules/identity/authorization). It then shows an alert that you have to sign in to continue. After
sign-in it returns to that page.

A page can say why with `?reason=<namespace>`. The alert then reads the i18n keys `<namespace>.signInReason.title` and
`<namespace>.signInReason.description`, so each module words its own reason. An example is
`?reason=users.emailChange`. An unknown reason shows the generic `auth.signInReason` text.

### Emailed links

With `magicLink` or `verifyEmail`, the module also registers the `/auth/magic-link` page that the emailed links open.
It does so whenever `@nuxt/ui` is installed, with or without `pages.login`.

- Opening the page changes nothing, because mail scanners and link previews follow links too.
- Its **Continue signing in** button posts the code to `/api/auth/magic-link/confirm`.
- It then goes to the link's `redirect`, or to `afterLogin`.
- A used or expired link shows an error on the page.

Without `@nuxt/ui`, add your own page at that path that posts the `code`.

## Module pages

| Page | What it covers | For |
| --- | --- | --- |
| [Server API](/modules/identity/auth/server) | Authorizing routes, defining permissions, roles and scopes, the before hook, API tokens, access tokens and auth emails. | App developers and module authors, server mode |
| [Reference](/modules/identity/auth/reference) | Composables, hooks, routes, database tables and translations. | App developers, server mode |
| [OAuth providers](/modules/identity/auth/oauth-providers) | Sign-in through GitHub, Google, frigear.nu or any OpenID Connect provider, and kept provider tokens. | App developers, server mode |
| [Client mode](/modules/identity/auth/client-mode) | Sign-in for an SPA or a Capacitor app at an issuer, with tokens instead of a session. | App developers, client mode |

## Next steps

- [Protect a route](/examples/tasks/protect-a-route) – require a signed-in user on a route of your own.
- [Server API](/modules/identity/auth/server) – look up `authorize`, the build APIs and tokens.
- [Auth and scopes](/guide/concepts/auth-and-scopes) – how sessions, API tokens and access tokens differ.
- [OAuth providers](/modules/identity/auth/oauth-providers) – add GitHub, Google or Sign in with frigear.nu.
