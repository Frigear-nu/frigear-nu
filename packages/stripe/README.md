# @frigear-nu/stripe

Core Stripe plumbing for the frigear ecosystem. It owns the SDK, the user <-> Stripe customer link and a single
verified, idempotent webhook that other modules (subscriptions, payments, ...) subscribe to. It contains no product
logic itself.

## Setup

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/users', '@frigear-nu/stripe'],
  hub: { db: { dialect: 'sqlite', driver: 'libsql' }, kv: true }, // kv is required (webhook idempotency)
  stripe: { settings: { webhookPath: '/api/stripe/webhook' } }, // optional, this is the default
})
```

`unstorage` must be resolvable by the host app (NuxtHub KV needs it).

Environment variables:

| Variable                             | Purpose                                         |
| ------------------------------------ | ----------------------------------------------- |
| `NUXT_STRIPE_SECRET_KEY`             | Stripe secret key (`runtimeConfig.stripe.secretKey`) |
| `NUXT_STRIPE_WEBHOOK_SECRET`         | Webhook signing secret (`whsec_...`)            |
| `NUXT_STRIPE_API_VERSION`            | Optional override, defaults to the pinned `2026-09-30.endive` |
| `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Publishable key (`runtimeConfig.public.stripe.publishableKey`) |

## Database

Extends the `users` table with a nullable `stripe_customer_id` column. Generate and commit migrations in the host app.

## Server utils (auto-imported in Nitro)

- `useStripe()` - the Stripe SDK, using the fetch HTTP client (Cloudflare Workers compatible).
- `ensureStripeCustomer(userId)` - returns the user's Stripe customer id: stored id, else a Stripe search by email, else a new customer (persisted).
- `getStripeCustomerUser(customerId)` - the local user row for a Stripe customer id, or `null`.

## Webhook

`POST /api/stripe/webhook` reads the raw body, verifies the signature (`constructEventAsync` + SubtleCrypto), and
dispatches to handlers. Processed event ids are stored in NuxtHub KV for 7 days, so duplicates are ignored. If any
handler throws, the others still run, the response is 500 (Stripe retries) and the event is not marked processed -
**handlers must be idempotent**. The Nitro hook `stripe:event` is fired for every dispatched event.

## Subscribing to events

From a module (build time, bundled into the server - no runtime scanning):

```ts
import { registerStripeEventHandler } from '@frigear-nu/stripe/utils'

registerStripeEventHandler(nuxt, {
  events: ['customer.subscription.updated', 'checkout.session.completed'], // or '*'
  handler: resolver.resolve('./runtime/server/stripe/subscription-events'),
  order: 100, // optional, lower runs first
})
```

```ts
// runtime/server/stripe/subscription-events.ts
import { defineStripeEventHandler } from '@frigear-nu/stripe/utils'

export default defineStripeEventHandler<'customer.subscription.updated' | 'checkout.session.completed'>(
  async (event, { stripe, userId, event: h3Event }) => {
    // `event` is narrowed by `event.type`; `userId` is null for unknown customers
  },
)
```

From a host app's Nitro plugin:

```ts
export default defineNitroPlugin(() => {
  onStripeEvent('invoice.payment_failed', (event, ctx) => { /* ... */ })
})
```
