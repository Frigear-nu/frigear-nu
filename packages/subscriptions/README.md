# @frigear-nu/subscriptions

Recurring Stripe subscriptions for the frigear ecosystem: host-defined plans, checkout, upgrade/downgrade, billing
portal, entitlements and opt-in account pages. Built on [`@frigear-nu/stripe`](../stripe) (customer link + verified
webhook) and [`@frigear-nu/users`](../users). One-off payments are out of scope.

## Features

- 📋 Plans declared in config; live prices resolved from Stripe and cached in NuxtHub KV (~5 minutes).
- 🔁 Checkout for new subscribers; immediate upgrade (prorated) or deferred downgrade, decided by plan `rank`.
- 🧾 Stripe billing portal sessions.
- 🪝 Policy hooks (`subscriptions:checkout:before`, `subscriptions:plans:filter`) for seasons, discounts, trials, ...
- 🔐 Entitlement utils (`hasActiveSubscription`, `getUserSubscription`) and a `subscription` route middleware.
- 🧩 `usePlans` / `useSubscription` composables, `SubscriptionPlans` / `SubscriptionStatus` components with slots and
  optional i18n, and opt-in membership/success/cancel pages (built with [`@nuxt/ui`](https://ui.nuxt.com)).
- 🗂️ Contributes a "Membership" item to `@frigear-nu/menu` (when installed).

## Quick Setup

```bash
npx nuxt module add @frigear-nu/subscriptions
```

Requires `@nuxthub/core` with `hub.kv: true` (the build fails otherwise), `@frigear-nu/users` and `@frigear-nu/stripe`
(set up its environment variables as described in its README).

## Configuration

```ts
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@frigear-nu/users',
    '@frigear-nu/menu', // optional
    '@frigear-nu/stripe',
    '@frigear-nu/subscriptions',
  ],
  hub: { db: { dialect: 'sqlite', driver: 'libsql' }, kv: true },
  subscriptions: {
    plans: {
      member: { label: 'Member', rank: 1, prices: ['price_123', { lookupKey: 'member_yearly' }] },
      patron: { label: 'Patron', description: 'Supporters', rank: 2, prices: [{ lookupKey: 'patron_yearly' }] },
    },
    settings: {
      pages: {
        membership: true, // or a custom path, default '/account/membership'
        success: true, // default '/account/membership/success'
        cancel: true, // default '/account/membership/cancel'
      },
      allowChangeInPortal: false, // default; a hint exposed in public runtime config, not enforced
    },
  },
})
```

- `plans` (default `{}`): keyed by plan key. `prices` are Stripe price ids or `{ lookupKey }`; `rank` decides upgrade vs.
  downgrade (never the price amount); `label` defaults to the key. Leave `plans` empty for "any active subscription"
  (checkout then requires a `priceId`).
- Pages are off unless enabled; `true` uses the default path, a string overrides it.

## Database

Registers a `subscriptions` table (one row per Stripe subscription: `id`, `userId`, `planKey`, `priceId`, `status`,
`cancelAtPeriodEnd`, period dates, `endedAt`, `rawItems`, timestamps). Rows are never deleted; prices outside the config are
stored with `planKey = null`. There is no foreign key to `users`.

**Host apps must generate and commit their own migration** (the `subscriptions` table plus `users.stripe_customer_id`
from `@frigear-nu/stripe`), using the app's complete module configuration. See `AGENTS.md` and the Module Kit docs.

## Webhook events

Subscribe the Stripe webhook endpoint (see `@frigear-nu/stripe`) to `customer.subscription.created`, `.updated`,
`.deleted`, `.paused` and `.resumed`. Each event is an idempotent upsert by subscription id; events for customers without
a local user are logged and ignored.

## API routes

- `GET /api/subscriptions/plans` - public; `{ plans }` with live prices, after the `subscriptions:plans:filter` hook.
- `GET /api/subscriptions/me` - `{ subscriptions, activePlan }` (401 when signed out).
- `POST /api/subscriptions/me/checkout` - session only (a bearer token gets 403 `session_required`); body `{ planKey?, priceId?, successUrl?, cancelUrl? }` (one of `planKey`/`priceId`
  required; a multi-price plan needs `priceId`). Returns `{ url }` (new Checkout Session) or
  `{ updated: true, kind: 'upgrade' | 'downgrade' }`. A higher rank upgrades immediately (`always_invoice` proration);
  a lower or equal rank (including monthly to yearly of one plan) is scheduled for period end. `400` for unknown or hidden
  plans/prices and URLs outside the request origin, `409` when already on that price.
- `POST /api/subscriptions/me/portal` - session only; body `{ returnUrl? }`; returns `{ url }` of a billing portal session.

## Policy hooks

```ts
// server/plugins/subscription-policy.ts
export default defineNitroPlugin((nitro) => {
  // ctx: { event, userId, planKey, priceId, kind: 'checkout' | 'upgrade' | 'downgrade', params }
  // Throw to deny. `params` (Stripe Checkout Session params) only applies when `kind === 'checkout'`.
  nitro.hooks.hook('subscriptions:checkout:before', (ctx) => {
    if (ctx.kind === 'checkout') ctx.params.subscription_data = { ...ctx.params.subscription_data, trial_period_days: 7 }
  })

  // ctx: { event (undefined outside a request), plans }. Change `ctx.plans` to hide or reorder plans.
  nitro.hooks.hook('subscriptions:plans:filter', (ctx) => {
    ctx.plans = ctx.plans.filter(plan => plan.key !== 'secret')
  })
})
```

## Entitlements and middleware

```ts
// server (auto-imported, or from '@frigear-nu/subscriptions/utils')
const subscription = await getUserSubscription(userId)
const ok = await hasActiveSubscription(userId, { plans: ['member'], statuses: ['active', 'trialing'] }) // statuses default
```

```ts
// page
definePageMeta({ middleware: 'subscription', subscription: { plans: ['member'], redirectTo: '/join' } })
```

Redirects to `redirectTo` (else the membership page) with `?redirect=<route>`; a no-op when neither exists.

## Composables and components

- `usePlans()` - `{ plans, status, loading, error, refresh }`.
- `useSubscription()` - `{ subscription, plan, status, loading, loadError, isActive, cancelsAt, has(plan), pending, error, refresh, subscribe(planKeyOrPriceId, { successUrl?, cancelUrl? }), openPortal(returnUrl?) }`.
- `<SubscriptionPlans>` - props `locale`, `currency`, `interval`, `plans`, `confirmChange`; slots `loading`,
  `empty`, `header`, `badge`, `price`, `features`, `action`, `confirm`, `confirm-actions`.
- `<SubscriptionStatus>` - props `locale`; slots `header`, `loading`, `empty`, `plan`, `badge`, `dates`, `actions`.

Text uses `useModuleT('subscriptions…')`: `subscriptions.<group>.<key>` from `@nuxtjs/i18n` when defined, else English defaults. Plan names come from `subscriptions.catalog.<planKey>.label` / `.description`, falling back to the plan config.
