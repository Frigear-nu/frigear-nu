# @frigear-nu/events

Database-backed events for the frigear ecosystem: ticket types (free and paid), addons such as food, capacity, sale
windows, per-user limits, optional membership requirements, Stripe payments through
[`@frigear-nu/payments`](../payments), QR check-in and opt-in pages built with [`@nuxt/ui`](https://ui.nuxt.com).

## Quick Setup

Requires `@nuxthub/core` with `hub.kv: true`, `@frigear-nu/users`, `@frigear-nu/stripe` and `@frigear-nu/payments`.
`@frigear-nu/subscriptions` (membership requirements) and `@frigear-nu/menu` are optional.

```ts
export default defineNuxtConfig({
  modules: ['@frigear-nu/users', '@frigear-nu/stripe', '@frigear-nu/payments', '@frigear-nu/events'],
  events: { settings: { pages: { events: true, event: true, tickets: true } } },
})
```

Generate and commit a migration for the events tables in your app (see the repository `AGENTS.md`).

Staff routes (event management, check-in) need the `events:manage` permission (attendee details over MCP need `events:pii`,
refunds the session-only `events:refund`). Grant them to a role, either the module's `eventmanager` role
(`events: { settings: { roles: true } }`) or your own:

```ts
export default defineNuxtConfig({
  authorization: { roles: { coordinator: { label: 'Coordinator', grant: ['events:manage', 'events:refund', 'events:pii'] } } },
})
```

Policies on `events:manage` and `events:refund` (`definePolicy`) receive the event row (`typeof schema.events.$inferSelect`)
as their `record`, on every route and MCP tool: also when the action is on a ticket type, add-on group, add-on or ticket,
the policy gets the event it belongs to (never the child row). Checks without a record (listing, creating an event) run
the policy only with `withoutRecord`.

```ts
// server/policies.ts: youth coordinators manage the `youth-*` events only
export default [
  definePolicy<typeof schema.events.$inferSelect>('events:manage', async ({ event, user, record }) =>
    (await getEffectiveRoles(event, user)).includes('youth') ? record?.slug.startsWith('youth-') : undefined),
]
```

Tickets (`tickets:read`, `tickets:write`) are self-service: every signed-in user holds them. The named scope `tickets`
offers both to API tokens and OAuth clients.

Full documentation: `apps/docs/content/3.modules/3.features/1.events/index.md`.

## Development

```bash
pnpm --filter @frigear-nu/events test
pnpm --filter @frigear-nu/events lint
```
