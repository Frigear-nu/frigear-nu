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

Staff routes (event management, check-in) are denied until the host implements the `events:authorize` Nitro hook:

```ts
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('events:authorize', (ctx) => { ctx.allowed = isStaff(ctx.userId) })
})
```

Full documentation: `apps/docs/content/4.modules/06.events.md`.

## Development

```bash
pnpm --filter @frigear-nu/events test
pnpm --filter @frigear-nu/events lint
```
