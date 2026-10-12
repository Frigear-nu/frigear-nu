import { asc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { newId } from '../../../utils'

// Copies an event with its whole catalogue (ticket types, addon groups, addons) into a new draft.
// Sold tickets are not copied. The start and end stay as they were: staff move them in the editor.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event)
  const id = getRouterParam(event, 'id')!
  const [source] = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1)
  if (!source) throw createError({ statusCode: 404, statusMessage: 'Event not found.' })

  const taken = async (slug: string) => (await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.slug, slug)).limit(1)).length > 0
  let slug = `${source.slug}-copy`
  for (let n = 2; await taken(slug); n++) slug = `${source.slug}-copy-${n}`

  const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = source
  const [copy] = await db.insert(schema.events).values({ ...fields, id: newId('evn'), slug, status: 'draft' }).returning()

  const types = await db.select().from(schema.eventTicketTypes).where(eq(schema.eventTicketTypes.eventId, id)).orderBy(asc(schema.eventTicketTypes.sortOrder))
  const groups = types.length
    ? await db.select().from(schema.eventAddonGroups).where(inArray(schema.eventAddonGroups.ticketTypeId, types.map(t => t.id))).orderBy(asc(schema.eventAddonGroups.sortOrder))
    : []
  const addons = groups.length
    ? await db.select().from(schema.eventAddons).where(inArray(schema.eventAddons.groupId, groups.map(g => g.id))).orderBy(asc(schema.eventAddons.sortOrder))
    : []

  for (const type of types) {
    const { id: _t, createdAt: _tc, updatedAt: _tu, ...typeFields } = type
    const [newType] = await db.insert(schema.eventTicketTypes).values({ ...typeFields, id: newId('ttp'), eventId: copy!.id }).returning()
    for (const group of groups.filter(g => g.ticketTypeId === type.id)) {
      const { id: _g, ...groupFields } = group
      const [newGroup] = await db.insert(schema.eventAddonGroups).values({ ...groupFields, id: newId('agr'), ticketTypeId: newType!.id }).returning()
      for (const addon of addons.filter(a => a.groupId === group.id)) {
        const { id: _a, ...addonFields } = addon
        await db.insert(schema.eventAddons).values({ ...addonFields, id: newId('adn'), groupId: newGroup!.id })
      }
    }
  }

  setResponseStatus(event, 201)
  return copy
})
