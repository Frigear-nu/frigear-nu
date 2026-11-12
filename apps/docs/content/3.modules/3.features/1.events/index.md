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
  attendees, refunds and check-in. The staff API is guarded by the `events:manage` and `events:refund`
  [permissions](#permissions), which the `admin` role holds.
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

### Decide who manages events

:::warning
Staff routes check permissions through [Authorization](/modules/identity/authorization). Without a role that holds
`events:manage`, nobody can manage events. The `admin` role holds it by default.
:::

Give the permissions to the people who run events with a role of your own, or turn on `settings.roles` for the ready-made
`eventmanager` role:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  events: { settings: { roles: true } }, // ships the `eventmanager` role
  authorization: {
    roles: {
      // Roles are built from permissions. `events:*` covers events:manage and events:refund, but not events:pii.
      organiser: { label: 'Organiser', grant: ['events:*', 'events:pii'], inherit: ['user'] },
    },
  },
})
```

[Let staff manage events](/modules/features/events/server#let-staff-manage-events) shows how a route checks them.

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
| `settings.roles` | `boolean` | `false` | Ships the `eventmanager` role. |
| `settings.mcp` | `boolean` | `false` | Adds the module's [MCP tools](/modules/features/events/server#mcp-tools). |
| `settings.pages.events` | `string \| boolean` | off | The event list. `true` is `/events`. |
| `settings.pages.event` | `string \| boolean` | off | The event page. `true` is `/events/:slug`. |
| `settings.pages.tickets` | `string \| boolean` | off | The signed-in user's tickets. `true` is `/account/tickets`. |
| `settings.pages.admin` | `string \| boolean` | off | The staff event list. `true` is `/admin/events`. |
| `settings.pages.adminEvent` | `string \| boolean` | off | The staff event page. `true` is `/admin/events/:id`. |

**`settings.reservationMinutes`** is also the lifetime of the Stripe Checkout session.

**`settings.pages.*`** paths keep the parameters of the default, such as `:slug`.

**`settings.roles`.** Registers the `eventmanager` [role](/modules/identity/authorization/roles-and-requirements)
with `events:manage`, `events:refund` and `events:pii`, and also puts those three into `admin`. Without it, only `admin`
holds them, unless your app grants them to a role of its own. Your own `authorization.roles.eventmanager` merges into
the module's role: your label wins, and `grant` and `inherit` are added together.

## Permissions

Events registers these permissions with [Authorization](/modules/identity/authorization). A staff route calls
`authorize(event, 'events:manage')`; self-service routes call `authorize(event, 'tickets:write')`.

| Permission | Flags | Held by default | What it allows |
| --- | --- | --- | --- |
| `events:manage` | | `admin`, and `eventmanager` with `settings.roles` | Create and edit events, ticket types and add-ons, and check tickets in. |
| `events:refund` | sessionOnly | `admin`, and `eventmanager` | Refund a paid ticket. Cookie sessions only. |
| `events:pii` | sensitive | `admin`, and `eventmanager` | See attendee names and emails in the MCP tools. A `*` or `events:*` grant never covers it: grant it by name. |
| `tickets:read` | implicit | every signed-in user | Read your own tickets and event details. |
| `tickets:write` | implicit | every signed-in user | Buy tickets and pay for them. |

- **Scope:** `tickets` (label "Your tickets") expands to `tickets:read` and `tickets:write`. A token or OAuth client
  with it can read and buy the user's own tickets, and is refused every staff route.
- **Roles:** `eventmanager`, shipped only with `settings.roles: true`.
- **Requirements and policies:** none. The module registers no requirement and no policy of its own. Add one with
  [`definePolicy`](/modules/identity/authorization/policies) when, say, an organiser may only edit their own events.
- **Why `events:refund` is separate:** money moves, so it is session only, and a token can never refund. A role that
  grants `events:manage` by name must grant `events:refund` too (`events:*` covers both).

See [roles and requirements](/modules/identity/authorization/roles-and-requirements) for how roles are built and merged.

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
