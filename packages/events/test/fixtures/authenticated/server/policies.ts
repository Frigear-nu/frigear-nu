import type { schema } from '@nuxthub/db'

type EventRow = typeof schema.events.$inferSelect

// Test policy: staff on `@scoped.test` may only manage the events whose slug starts with `scoped-`. Policies of
// `events:manage` always receive the event row, also when the route acts on a ticket type, addon or ticket.
// It also guards auth's import order: `definePolicy` runs at import time, with no workaround import above.
export default [
  definePolicy<EventRow>('events:manage', ({ user, record }) => {
    if (!String(user.email).endsWith('@scoped.test')) return undefined
    return typeof record?.slug === 'string' && record.slug.startsWith('scoped-')
  }),
]
