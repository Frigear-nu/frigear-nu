# @frigear-nu/notify

Generic notification driver/dispatch Nuxt module. Lets feature modules (e.g. `@frigear-nu/users`)
dispatch email/SMS/simple notifications, and push UI toasts, without ever deciding how they're
delivered - that choice (and configuration) belongs to the app/consuming layer.

## Quick Setup

Other modules declare `@frigear-nu/notify` as a `moduleDependency`, so it's installed
automatically wherever they're used - you don't need to add it to `modules` yourself unless you
want to configure it.

## Configuration

Configure the module via the `notify` key in `nuxt.config.ts`. Every notification type (`email`,
`sms`, `simple`) defaults to the built-in `log` driver (logs instead of sending) - only the
`ui` driver has no default, since there's no sensible UI to push to unless you configure one:

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
    ui: {
      // Built-in `'@nuxt/ui'` driver (forwards to `@nuxt/ui`'s `useToast`), or a path to a
      // function (default export) matching the `UIDriver` signature - a composable factory
      // invoked once, synchronously, during `useNotify()`'s own setup-time call.
      driver: '@nuxt/ui',
    },
  },
})
```

Only the configured driver for each notification type is ever resolved/loaded - unconfigured
drivers (e.g. the `ui` driver when `notify.ui` isn't set) are never bundled, to keep the client
bundle small.

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

### UI notifications

When `notify.ui.driver` is configured, `useNotify` is auto-imported client-side to push
`UINotification`s through the configured driver (e.g. `@nuxt/ui`'s `useToast`):

```vue
<script setup lang="ts">
const notify = useNotify()

function onSuccess() {
  notify.addNotification(defineUINotification({
    title: 'Saved',
    text: 'Your changes have been saved.',
    type: 'success',
  }))
}
</script>
```
