import { db } from '@nuxthub/db'

// Host policy for `@frigear-nu/events`: who may manage events, ticket types and attendees (and check tickets in).
// Staff roles, as in the old app (`eventmanager` is the event-specific one).
const eventStaff = ['admin', 'manager', 'coordinator', 'eventmanager']

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('events:authorize', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    ctx.allowed = !!actor && eventStaff.includes(effectiveRole(actor))
  })
})
