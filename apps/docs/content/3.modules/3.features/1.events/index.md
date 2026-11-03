---
title: Events
description: Database-backed events with ticket types, addons, capacity, sale windows, membership requirements, Stripe payments and QR check-in.
navigation:
  title: Overview
---

Events and tickets, built on [Payments](/modules/commerce/payments): ticket types, addons, capacity, sale windows,
membership requirements and QR check-in. Use it when the site sells or registers for events; money is delegated to
Payments, so it requires the Stripe and Payments modules (see below).

- **Prices live in the database** (minor units) and are charged through Checkout `price_data`; there are no Stripe ids to
  maintain per environment.
- **Ticket state follows payment state.** A paid ticket becomes `paid` only through the `payments:paid` hook, fed by
  verified Stripe events. Free tickets (total `0`) are issued immediately without Stripe.
- **Purchased tickets are snapshots.** Amount, currency and chosen addons are copied onto the ticket, which has no
  foreign keys to the catalogue, so catalogue edits never change what someone bought.
- **Staff access is the host's decision** through the `events:authorize` hook (denied by default).

:module-runtime{server client}

::note
**Requires** `@nuxthub/core` (KV on), `@frigear-nu/module-kit`, [`@frigear-nu/auth`](/modules/identity/auth),
[`@frigear-nu/mcp`](/modules/features/mcp), [`@frigear-nu/users`](/modules/identity/users), [`@frigear-nu/ui`](/modules/interface/ui),
[`@frigear-nu/stripe`](/modules/commerce/stripe) and [`@frigear-nu/payments`](/modules/commerce/payments).
**Optional** [`@frigear-nu/subscriptions`](/modules/commerce/subscriptions) (membership provider),
[`@frigear-nu/menu`](/modules/interface/menu), [`@frigear-nu/widget`](/modules/interface/widget) (event page tabs) and
[`@frigear-nu/admin`](/modules/interface/admin) (the admin pages exist only with it), [`@frigear-nu/account`](/modules/identity/account)
(the left navigation and heading around the tickets page).
::

## Quick setup

```bash
pnpm add @frigear-nu/events @nuxthub/core
```

```ts
export default defineNuxtConfig({
  modules: ['@nuxthub/core', '@frigear-nu/events'],
  events: {
    settings: {
      pages: { events: true, event: true, tickets: true },
      reservationMinutes: 30,
    },
  },
})
```

Pages are opt-in and use [`@nuxt/ui`](https://ui.nuxt.com). With `@nuxtjs/i18n` installed, translated texts follow the
active locale; otherwise `en` is used.

## Options

| Option                       | Type                | Default                              | Purpose                                                                                           |
| ---------------------------- | ------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `settings.reservationMinutes`| `number`            | `30`                                 | How long an unpaid ticket keeps its seat; also the Stripe session lifetime.                       |
| `settings.mcp`               | `boolean`           | `false`                              | Expose the module's tools on the [MCP](/modules/features/mcp) endpoint (see [MCP tools](/modules/features/events/server#mcp-tools)).      |
| `settings.pages.events`      | `string \| boolean` | off                                  | Event list. `true` = `/events`.                                                                   |
| `settings.pages.event`       | `string \| boolean` | off                                  | Event detail; path must contain `:slug`. `true` = `/events/:slug`.                                |
| `settings.pages.tickets`     | `string \| boolean` | off                                  | The signed-in user's tickets. `true` = `/account/tickets`.                                        |
| `settings.pages.admin`       | `string \| boolean` | off (needs `@frigear-nu/admin`)      | Staff event list. `true` = the admin route for `events`, `/admin/events` by default.              |
| `settings.pages.adminEvent`  | `string \| boolean` | off (needs `@frigear-nu/admin`)      | Staff event page; path must contain `:id`. `true` = `/admin/events/:id`.                          |

## On this module

- [Server](/modules/features/events/server): purchase rules, seasonal sales, membership providers, staff authorization, MCP tools.
- [App](/modules/features/events/app): pages, composables, components, catalogue actions and the admin event page.
- [Reference](/modules/features/events/reference): hooks, routes, database and translations.
