---
title: Subscriptions
description: Sell recurring plans, such as a yearly membership, through Stripe, and check which plan a user holds.
navigation:
  title: Overview
---

Subscriptions lets your app sell recurring plans, such as a yearly membership, through Stripe. You declare the plans in
config. The module handles checkout, upgrades, downgrades and the Stripe billing portal. Your code then asks one
question: does this user hold plan X? For a one-time charge, use [Payments](/modules/commerce/payments).

The package is `@frigear-nu/subscriptions`. Stripe owns the products and prices. A plan is not a role: access follows
what the user pays for, and "membership" is only the name the pages use.

## What you get

- **Pages** (opt-in): a membership page at `/account/membership`, and a success and a cancel page after checkout.
- **Admin area** (with [Admin](/modules/interface/admin) and [Widget](/modules/interface/widget)): a Membership tab
  where [staff](/guide/concepts/glossary) grant a free membership or send a payment link.
- **Server routes** (on by default): plans with live prices, the user's subscription, checkout and the billing portal.
  Staff routes follow the `users:admin:authorize` hook of [Users](/modules/identity/users).
- **Composables and helpers** (on by default): `useSubscription()`, `usePlans()` and a `subscription` route middleware
  in the app, and `hasActiveSubscription` on the server.

:module-runtime{server client}

::note
**Installed for you:** `@frigear-nu/module-kit`, [Auth](/modules/identity/auth), Users,
[Stripe](/modules/commerce/stripe), [Notify](/modules/platform/notify), [MCP](/modules/features/mcp) and
[UI](/modules/interface/ui).

**You add:** `@nuxthub/core` with key-value storage (KV) on, and `@nuxt/ui` for the pages and components.

**Optional:** [Menu](/modules/interface/menu) for the account menu item, Admin and Widget for the admin tab and card,
Payments to store invoices as payments, [Email Templates](/modules/platform/email-templates) for the payment link
email, and `@nuxtjs/i18n` for translated labels.
::

## Quick setup

::steps

### Install Subscriptions

```bash
pnpm add @frigear-nu/subscriptions @nuxthub/core @nuxt/ui
```

### Declare your plans in nuxt.config.ts

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/menu', // optional
    '@frigear-nu/subscriptions', // installs Users and Stripe for you
  ],
  hub: { db: { dialect: 'sqlite', driver: 'libsql' }, kv: true },
  subscriptions: {
    plans: {
      member: { label: 'Member', rank: 1, prices: [{ lookupKey: 'member_yearly' }] },
      patron: { label: 'Patron', rank: 2, prices: [{ lookupKey: 'patron_yearly' }] },
    },
    settings: { pages: { membership: true, success: true, cancel: true } },
  },
})
```

:::caution
Use test keys (`sk_test_...`) until the whole flow works: live keys charge real cards.
:::

### Connect your Stripe account

Follow [Stripe setup](/guide/going-further/stripe-setup) for the keys, the webhook events, recurring prices with these
lookup keys and the billing portal.

:::warning
Without a [migration](/guide/concepts/glossary), webhooks and checkouts fail.
:::

### Generate the migration

Generate one migration for the `subscriptions` table and Stripe's `users` column, and commit it:

```bash
pnpm db:generate
```

### Check the plan in your code

Let only members call a route:

```ts [server/api/perks.get.ts]
import { forbidden } from '@frigear-nu/module-kit/server'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!await hasActiveSubscription(user.id, { plans: ['member', 'patron'] })) {
    throw forbidden('Members only.')
  }
  return { perks: [] }
})
```

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** signed in, `/account/membership` lists both plans. After subscribing with Stripe's test card
`4242 4242 4242 4242`, `GET /api/subscriptions/me` returns `activePlan: 'member'` once the webhook has arrived.
::

## Options

Options go under the `subscriptions` key.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `plans` | `Record<string, PlanConfig>` | `{}` | Plans by plan key. Empty means any active subscription counts. |
| `plans.<key>.prices` | `Array<string \| { lookupKey }>` | – | Required. Stripe price ids or lookup keys, such as monthly and yearly. |
| `plans.<key>.rank` | `number` | – | Required. A higher rank is a higher tier, which decides upgrade or downgrade. |
| `plans.<key>.label` | `string` | the key | The display label. |
| `plans.<key>.description` | `string` | – | The plan description. |
| `plans.<key>.features` | `string[]` | – | Bullet points on the plan card. |
| `plans.<key>.availability.disabledRanges` | `{ from, to }[]` | – | Date windows in which new subscribers cannot see or buy the plan. |
| `settings.pages.membership` | `string \| boolean` | off | `true` is `/account/membership`. A string is a custom path. |
| `settings.pages.success` | `string \| boolean` | off | `true` is `/account/membership/success`. |
| `settings.pages.cancel` | `string \| boolean` | off | `true` is `/account/membership/cancel`. |
| `settings.allowChangeInPortal` | `boolean` | `false` | Tells the interface that plans change in the billing portal. Not enforced. |
| `settings.mcp` | `boolean` | `false` | Adds the `my-subscriptions` [MCP](/modules/features/mcp) tool. |

**`plans`** left empty makes checkout require a `priceId`. It then accepts any active recurring Stripe price, and stored
rows get `planKey = null`.

**`plans.<key>.label`**, **`description`** and **`features`** give way to `subscriptions.catalog.<key>.*` i18n keys.

**`plans.<key>.availability.disabledRanges`** dates are inclusive. `{fullYear}` becomes the current year, as in
`{fullYear}-06-01`. Subscribers still see the plan.

**`settings.pages.*`** need `@nuxt/ui`.

### Runtime config

`public.subscriptions` exposes the page paths, the plans without prices and `allowChangeInPortal`.

## Module pages

| Page | What it covers | For |
| --- | --- | --- |
| [Server API](/modules/commerce/subscriptions/server) | Checking plans, webhooks, checkout rules and staff membership. | App developers and module authors |
| [App](/modules/commerce/subscriptions/app) | Composables, the route middleware, components and the membership pages. | App developers |
| [Reference](/modules/commerce/subscriptions/reference) | Hooks, routes and DTOs, the database and translations. | App developers |

## Next steps

- [Stripe setup](/guide/going-further/stripe-setup) – create the prices and the billing portal your plans use.
- [Subscriptions app](/modules/commerce/subscriptions/app) – build your own pricing page with the composables.
