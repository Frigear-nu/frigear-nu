# @frigear-nu/notify

Email notification driver/dispatch Nuxt module. Lets feature modules (e.g. `@frigear-nu/users`)
dispatch `EmailNotification`s without ever deciding how they're delivered - that choice (and
configuration) belongs to the app/consuming layer.

## Quick Setup

Other modules declare `@frigear-nu/notify` as a `moduleDependency`, so it's installed
automatically wherever they're used - you don't need to add it to `modules` yourself unless you
want to configure it.

## Configuration

Configure the module via the `notify` key in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  notify: {
    email: {
      // Name of a built-in driver (`'log'`, the default - logs instead of sending) or a path to
      // a function (default export) matching the `EmailDriver` signature below, for a real
      // provider (Resend, SMTP, ...).
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

## Usage

`dispatchEmailNotification` is auto-imported server-side wherever this module is installed:

```ts
await dispatchEmailNotification({
  to: user.email,
  subject: 'Welcome!',
  body: '<p>Thanks for signing up.</p>',
  text: 'Thanks for signing up.',
})
```
