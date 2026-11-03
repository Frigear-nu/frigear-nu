---
title: Subscriptions
description: Recurring Stripe subscriptions - host-defined plans, checkout, upgrade/downgrade, billing portal, entitlements and account UI.
navigation:
  title: Overview
---

Recurring subscriptions on top of [Stripe](/modules/commerce/stripe): host-defined plans, checkout with upgrade and
downgrade, the billing portal, entitlements and account UI. One-off payments belong to
[Payments](/modules/commerce/payments); "membership" is just a label a host picks for its plans.

:module-runtime{server client}

- **Stripe owns the catalog.** No products or prices tables: plans are declared in config and prices are resolved live
  from Stripe, cached in NuxtHub KV for about five minutes. The module mirrors only per-user state.
- **Host policy through hooks.** Seasonal windows and member discounts are injected with
  [hooks](/modules/commerce/subscriptions/reference#hooks), not built in.
- **No copy in Stripe.** Labels come from config and optional i18n keys. The UI is headless-first (composables) with
  replaceable components and slots; pages are opt-in.
- **Entitlements, not roles.** Other code asks "does this user hold plan X?".

::note
**Requires** `@nuxthub/core` (KV on; the build throws without it), `@frigear-nu/module-kit`,
[`@frigear-nu/auth`](/modules/identity/auth), [`@frigear-nu/mcp`](/modules/features/mcp), [`@frigear-nu/users`](/modules/identity/users) and
[`@frigear-nu/stripe`](/modules/commerce/stripe) (configure it as described there: keys, webhook and KV) and
[`@frigear-nu/ui`](/modules/interface/ui) (the shared components the pages are built from).
**Optional** [`@frigear-nu/menu`](/modules/interface/menu), [`@frigear-nu/widget`](/modules/interface/widget) and
[`@frigear-nu/admin`](/modules/interface/admin) (the admin user tab and card need both), `@nuxt/ui` (components and pages) and
`@nuxtjs/i18n` (translated labels; English otherwise).
::

## Quick setup

```bash
pnpm add @frigear-nu/subscriptions @nuxthub/core
```

List the module after the ones it builds on:

```ts
export default defineNuxtConfig({
  modules: [
    '@nuxthub/core',
    '@nuxt/ui',
    '@frigear-nu/users',
    '@frigear-nu/menu', // optional
    '@frigear-nu/stripe',
    '@frigear-nu/subscriptions',
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

1. Set the Stripe [environment variables](/modules/commerce/stripe#environment-variables) (test keys in development).
2. Complete the [Stripe dashboard setup](#stripe-dashboard-setup).
3. Generate and commit your app's migration (see [Database](/modules/commerce/subscriptions/reference#database)); skipping it is the most common cause of failing
   webhooks and checkouts.
4. Verify: sign in, open `/account/membership` and subscribe with Stripe's test card `4242 4242 4242 4242`. After the
   redirect, `GET /api/subscriptions/me` returns the subscription once the webhook has landed.

## Options

| Option                                    | Type                           | Default | Purpose                                                                                           |
| ----------------------------------------- | ------------------------------ | ------- | ------------------------------------------------------------------------------------------------- |
| `plans`                                   | `Record<string, PlanConfig>`   | `{}`    | Plans keyed by plan key. Empty means "any active subscription" (see below).                       |
| `plans.<key>.prices`                      | `Array<string \| { lookupKey }>` | -     | Required. Stripe price ids and/or lookup refs; several per plan (monthly, yearly).                |
| `plans.<key>.rank`                        | `number`                       | -       | Required. Higher is a higher tier; decides upgrade vs downgrade. Amounts are never compared.      |
| `plans.<key>.label`                       | `string`                       | the key | Display label; i18n `subscriptions.catalog.<key>.label` wins when defined.                        |
| `plans.<key>.description`                 | `string`                       | -       | Optional; i18n `catalog.<key>.description` wins.                                                  |
| `plans.<key>.features`                    | `string[]`                     | -       | Bullet points on the plan card; i18n `catalog.<key>.features` (array) wins.                       |
| `plans.<key>.availability.disabledRanges` | `{ from, to }[]`               | -       | Date windows (inclusive; `{fullYear}` becomes the current year, e.g. `{fullYear}-06-01`) in which the plan is hidden from visitors without an active subscription. Subscribers still see it; checkout rejects a hidden plan. |
| `settings.pages.membership`               | `string \| boolean`            | off     | `true` = `/account/membership`, a string = custom path.                                           |
| `settings.pages.success`                  | `string \| boolean`            | off     | `true` = `/account/membership/success`.                                                           |
| `settings.pages.cancel`                   | `string \| boolean`            | off     | `true` = `/account/membership/cancel`.                                                            |
| `settings.allowChangeInPortal`            | `boolean`                      | `false` | Hint exposed as `public.subscriptions.allowChangeInPortal`. Not enforced; mirror your billing portal. |
| `settings.mcp`                            | `boolean`                      | `false` | Expose the `my-subscriptions` tool on the [MCP](/modules/features/mcp) endpoint.                           |

Without plans, checkout requires a `priceId` and accepts any active recurring Stripe price; stored rows get
`planKey = null`. Runtime config exposes `public.subscriptions` (`pages`, plans sorted by `rank` without prices, and
`allowChangeInPortal`) and a private `subscriptions.plans`. Pages need `@nuxt/ui` in the app; leave them out to build
your own UI with the [composables](/modules/commerce/subscriptions/app).

## Stripe dashboard setup

The general walkthrough is in [Stripe setup](/guide/going-further/stripe-setup). For this module:

1. **Webhook events**: subscribe the endpoint to `customer.subscription.created`, `.updated`, `.deleted`, `.paused` and
   `.resumed`.
2. **Products and prices**: create recurring prices. Use lookup keys to keep config environment-independent (test and
   live have different price ids). No metadata or copy is needed in Stripe.
3. **Billing portal** (Settings > Billing > Customer portal): enable cancellation and payment method updates. Enable
   subscription updates only with `allowChangeInPortal: true`, and list the prices the portal may switch between.

## On this module

- [Server API](/modules/commerce/subscriptions/server): entitlements, webhook handling, checkout rules and staff membership.
- [App](/modules/commerce/subscriptions/app): composables, middleware, components and the membership pages.
- [Reference](/modules/commerce/subscriptions/reference): hooks, routes and DTOs, database and translations.
