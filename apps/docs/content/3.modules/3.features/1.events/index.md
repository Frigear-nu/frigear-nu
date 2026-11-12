---
title: Events
description: Sell tickets to your events, free or paid through Stripe, and check people in at the door with a QR code.
navigation:
  title: Overview
---

Events lets you publish events and sell tickets to them. Signed-in users pick a ticket on the event page, pay through
Stripe Checkout and show a QR code at the door. [Staff](/guide/concepts/glossary) set up the events, ticket types,
add-ons and capacity in the [admin area](/guide/concepts/glossary). Use it when your app sells or registers places at
dated events. For recurring memberships, use [Subscriptions](/modules/commerce/subscriptions) instead.

The package is `@frigear-nu/events`. Money goes through [Payments](/modules/commerce/payments).

## What you get

- **Pages** (opt-in): the event list at `/events`, an event page at `/events/:slug`, and the signed-in user's tickets
  at `/account/tickets`.
- **Admin area** (opt-in, with [Admin](/modules/interface/admin)): an event list at `/admin/events`, and an event page
  with Details, Tickets and Attendees tabs. With [Widget](/modules/interface/widget), upcoming events also appear on the
  admin dashboard.
- **Server routes** (on by default): browsing events, buying and paying for tickets, and a staff API for events,
  attendees, refunds and check-in. The staff API stays closed until your app answers the `events:authorize`
  [policy hook](/guide/concepts/glossary).
- **Composables and helpers** (on by default): `useEvents`, `useEvent` and `useMyTickets`.
- **Emails.** None built in. Send a confirmation from the `events:ticket:paid` hook, which runs when a ticket is paid.
- **MCP tools** (opt-in): browse events and tickets, and manage events as staff, through [MCP](/modules/features/mcp).

:module-runtime{server client}

::note
**Installed for you:** [Stripe](/modules/commerce/stripe), [Payments](/modules/commerce/payments),
[Auth](/modules/identity/auth), [Users](/modules/identity/users), [MCP](/modules/features/mcp),
[UI](/modules/interface/ui) and Module Kit.
**You add:** `@nuxthub/core` (Events turns on its key-value storage), and `@nuxt/ui` for the pages.
**Optional:** [Admin](/modules/interface/admin) for the admin pages, [Subscriptions](/modules/commerce/subscriptions) as
the membership provider, [Widget](/modules/interface/widget) for the event page tabs, [Menu](/modules/interface/menu)
for menu items, and [Account](/modules/identity/account) for the navigation around the tickets page.
::

## Quick setup

::steps

### Install Events

```bash
pnpm add @frigear-nu/events @nuxthub/core
```

### Add it to nuxt.config.ts

```ts [nuxt.config.ts]
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

### Set the Stripe keys

:::caution
Use Stripe's test keys outside production, and live keys only in production. Keep the secret key and the webhook secret
out of the repository.
:::

A ticket becomes paid only from Stripe's verified webhook. Set `NUXT_STRIPE_SECRET_KEY`, `NUXT_STRIPE_WEBHOOK_SECRET`
and `NUXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and point the webhook at your app, as in
[Set the Stripe keys](/examples/tasks/sell-event-tickets#_2-set-the-stripe-keys).

### Generate the migration

:::warning
Without a [migration](/guide/concepts/glossary) the event tables do not exist, and every write to them fails.
:::

Events, Payments and Stripe add tables. Generate the migration and commit it:

```bash
pnpm db:generate
```

### Answer the policy hook

:::warning
Without this hook nobody can manage events. Staff access is denied until your app allows it.
:::

```ts [server/plugins/events-policy.ts]
// Loads the module's hook types: Nitro's server tsconfig does not include module types.
import type {} from '@frigear-nu/events'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('events:authorize', async (ctx) => {
    ctx.allowed = false // replace with your own staff check on ctx.userId
  })
})
```

[Let staff manage events](/examples/tasks/sell-event-tickets#_3-let-staff-manage-events) shows a check by role.

::

::callout{color="success" icon="i-lucide-check"}
**What you should see:** after staff publish an event, it appears at `/events`. A ticket bought there redirects to
Stripe Checkout, and once paid it shows on `/account/tickets` as `paid`.
::

## Options

Options go under the `events` key.

| Option | Type | Default | Purpose |
| --- | --- | --- | --- |
| `settings.reservationMinutes` | `number` | `30` | How long an unpaid ticket keeps its seat. |
| `settings.roles` | `boolean` | `false` | Ships the `eventmanager` role, just below `admin`. |
| `settings.mcp` | `boolean` | `false` | Adds the module's [MCP tools](/modules/features/events/server#mcp-tools). |
| `settings.pages.events` | `string \| boolean` | off | The event list. `true` is `/events`. |
| `settings.pages.event` | `string \| boolean` | off | The event page. `true` is `/events/:slug`. |
| `settings.pages.tickets` | `string \| boolean` | off | The signed-in user's tickets. `true` is `/account/tickets`. |
| `settings.pages.admin` | `string \| boolean` | off | The staff event list. `true` is `/admin/events`. |
| `settings.pages.adminEvent` | `string \| boolean` | off | The staff event page. `true` is `/admin/events/:id`. |

**`settings.reservationMinutes`** is also the lifetime of the Stripe Checkout session.

**`settings.pages.*`** paths keep the parameters of the default, such as `:slug`.

**`settings.roles`.** For apps with [roles and permissions](/modules/identity/authorization#roles-and-permissions)
(`authorization.rbac`). The `eventmanager` role holds every permission of `user`, plus `events:manage` and
`events:pii`. Without it, those two permissions go to `admin` only, unless your app grants them.

## Module pages

| Page | What it covers | For |
| --- | --- | --- |
| [Server API](/modules/features/events/server) | How a purchase is checked, sale schedules, membership providers, staff access and MCP tools. | App developers and module authors |
| [App](/modules/features/events/app) | Pages, composables, components and extending the admin event page. | App developers and module authors |
| [Reference](/modules/features/events/reference) | Hooks, routes, tables and translations. | App developers |

## Next steps

- [Sell event tickets](/examples/tasks/sell-event-tickets) – build the whole flow, from a new event to a paid ticket.
- [Stripe setup](/guide/going-further/stripe-setup) – create the keys and the webhook that mark tickets as paid.
- [Server API](/modules/features/events/server) – limit tickets to members, or connect your own membership list.
