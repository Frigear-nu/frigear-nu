# @frigear-nu/notify

Generic notification driver/dispatch Nuxt module. Lets feature modules (e.g. `@frigear-nu/users`)
dispatch email/SMS/simple notifications without ever deciding how they're
delivered - that choice (and configuration) belongs to the app/consuming layer.

## Quick Setup

Other modules declare `@frigear-nu/notify` as a `moduleDependency`, so it's installed
automatically wherever they're used - you don't need to add it to `modules` yourself unless you
want to configure it.

## Configuration

Configure the module via the `notify` key in `nuxt.config.ts`. Every notification type (`email`,
`sms`, `simple`) defaults to the built-in `log` driver (logs instead of sending):

```ts
export default defineNuxtConfig({
  notify: {
    email: {
      // Name of a built-in driver (`'log'`, the default - logs instead of sending) or a path to
      // a function (default export) matching the `EmailDriver` signature, for a real provider
      // (Resend, SMTP, ...).
      driver: '~/server/utils/resend-email-driver',
    },
    sms: {
      // Same idea, matching the `SMSDriver` signature, for a real provider (Twilio, ...).
      driver: '~/server/utils/twilio-sms-driver',
    },
    simple: {
      // Same idea, matching the `SimpleDriver` signature, for generic push notifications.
      driver: 'log',
    },
  },
})
```

Only the configured driver for each notification type is ever resolved/loaded.

In-app toasts are not part of this module: call `useToast()` from Nuxt UI directly.

#### Example Custom Driver

```ts
// server/utils/resend-email-driver.ts
import type { EmailDriver } from '@frigear-nu/notify/types'

const sendWithResend: EmailDriver = async (notification) => {
  // ... call your provider's API with notification.to/subject/body/text
}

export default sendWithResend
```

## Usage

### Server-side dispatch

`dispatchEmailNotification`, `dispatchSMSNotification`, and `dispatchSimpleNotification` are
auto-imported server-side wherever this module is installed:

```ts
await dispatchEmailNotification({
  to: user.email,
  subject: 'Welcome!',
  body: '<p>Thanks for signing up.</p>',
  text: 'Thanks for signing up.',
})

await dispatchSMSNotification({
  to: user.phone,
  body: 'Your verification code is 123456.',
})

await dispatchSimpleNotification({
  title: 'New signup',
  text: `${user.email} just signed up.`,
})
```

## Built-in email drivers: `resend`, `ses`, `cloudflare`

Zero dependencies and zero config beyond environment variables - each driver talks to its provider with plain `fetch`
(SES requests are signed with AWS SigV4 via Web Crypto). The driver and its credentials are read at **runtime**, so
you can switch providers per environment without rebuilding:

```bash
NUXT_NOTIFY_EMAIL_DRIVER=resend   # log (default) | resend | ses | cloudflare
NUXT_NOTIFY_EMAIL_FROM="Frigear <no-reply@frigear.nu>"

# resend
NUXT_NOTIFY_EMAIL_RESEND_API_TOKEN=...

# ses (v2 API)
NUXT_NOTIFY_EMAIL_SES_REGION=eu-west-1
NUXT_NOTIFY_EMAIL_SES_ACCESS_KEY_ID=...
NUXT_NOTIFY_EMAIL_SES_SECRET_ACCESS_KEY=...
NUXT_NOTIFY_EMAIL_SES_SESSION_TOKEN=...   # optional, for temporary credentials

# cloudflare (Email Service)
NUXT_NOTIFY_EMAIL_CLOUDFLARE_ACCOUNT_ID=...
NUXT_NOTIFY_EMAIL_CLOUDFLARE_API_TOKEN=...
```

Setting `notify.email.driver` in `nuxt.config.ts` to one of these names only changes the default; the env var still
wins. A missing credential fails the send with an error naming the variable to set. Any other `driver` value is still
treated as a path to a custom `EmailDriver`.

