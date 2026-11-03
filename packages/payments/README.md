# @frigear-nu/payments

One-time Stripe payments for the frigear ecosystem: Checkout sessions with inline prices, a `payments` table, refunds and
Nitro lifecycle hooks (`payments:paid`, `payments:failed`, `payments:expired`, `payments:refunded`). Built on
[`@frigear-nu/stripe`](../stripe); it has no webhook of its own and only reacts to the verified Stripe events that module
dispatches.

## Quick Setup

Requires `@nuxthub/core` with `hub.kv: true`, `@frigear-nu/users` and `@frigear-nu/stripe`.

```ts
export default defineNuxtConfig({
  modules: ['@frigear-nu/users', '@frigear-nu/stripe', '@frigear-nu/payments'],
})
```

Generate and commit a migration for the `payments` table in your app (see the repository `AGENTS.md`).

## Usage

```ts
// In a route handler
const { payment, url } = await createPayment({
  userId: user.id,
  items: [{ name: 'Ticket', amount: 15000, currency: 'DKK' }],
  reference: { type: 'event_ticket', id: ticketId },
  successUrl: '/thanks',
  cancelUrl: '/cancelled',
}, event)

// Anywhere in Nitro
nitroApp.hooks.hook('payments:paid', ({ payment }) => { /* ... */ })
```

Full documentation: `apps/docs/content/3.modules/2.commerce/2.payments.md`.

## Development

```bash
pnpm --filter @frigear-nu/payments test
pnpm --filter @frigear-nu/payments lint
```
