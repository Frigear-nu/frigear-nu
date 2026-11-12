import { asc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@nuxthub/db'
import { created, idParams, notFound, uniqueCopySlug } from '@frigear-nu/module-kit/server'
import type { AdminEventDto } from '../../../../types'
import { newId } from '../../../utils'

// Copies an event with its whole catalogue (ticket types, addon groups, addons) into a new draft.
// Sold tickets are not copied. The start and end stay as they were: staff move them in the editor.
export default defineEventHandler(async (event): Promise<AdminEventDto> => {
  await authorize(event, 'events:manage')
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const [source] = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1)
  if (!source) throw notFound('Event not found.')
  await authorize(event, 'events:manage', source)

  const slug = await uniqueCopySlug(source.slug, async candidate =>
    (await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.slug, candidate)).limit(1)).length > 0)

  const types = await db.select().from(schema.eventTicketTypes).where(eq(schema.eventTicketTypes.eventId, id)).orderBy(asc(schema.eventTicketTypes.sortOrder))
  const groups = types.length
    ? await db.select().from(schema.eventAddonGroups).where(inArray(schema.eventAddonGroups.ticketTypeId, types.map(t => t.id))).orderBy(asc(schema.eventAddonGroups.sortOrder))
    : []
  const addons = groups.length
    ? await db.select().from(schema.eventAddons).where(inArray(schema.eventAddons.groupId, groups.map(g => g.id))).orderBy(asc(schema.eventAddons.sortOrder))
    : []

  // Not a `db.transaction`: D1 (NuxtHub's sqlite on Cloudflare) has no interactive transactions, and `db.batch` is
  // sqlite-only. The inserts run one by one instead and, when one fails, the partial copy is removed again (children
  // first, so it does not rely on `ON DELETE CASCADE` being enforced), so a failed clone leaves nothing behind.
  const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = source
  const copyId = newId('evn')
  const inserted = { types: [] as string[], groups: [] as string[], addons: [] as string[] }
  try {
    const [copy] = await db.insert(schema.events).values({ ...fields, id: copyId, slug, status: 'draft' }).returning()
    for (const type of types) {
      const { id: _t, createdAt: _tc, updatedAt: _tu, ...typeFields } = type
      const typeId = newId('ttp')
      await db.insert(schema.eventTicketTypes).values({ ...typeFields, id: typeId, eventId: copyId })
      inserted.types.push(typeId)
      for (const group of groups.filter(g => g.ticketTypeId === type.id)) {
        const { id: _g, ...groupFields } = group
        const groupId = newId('agr')
        await db.insert(schema.eventAddonGroups).values({ ...groupFields, id: groupId, ticketTypeId: typeId })
        inserted.groups.push(groupId)
        for (const addon of addons.filter(a => a.groupId === group.id)) {
          const { id: _a, ...addonFields } = addon
          const addonId = newId('adn')
          await db.insert(schema.eventAddons).values({ ...addonFields, id: addonId, groupId })
          inserted.addons.push(addonId)
        }
      }
    }
    return created(event, toAdminEventDto(copy!))
  }
  catch (error) {
    if (inserted.addons.length) await db.delete(schema.eventAddons).where(inArray(schema.eventAddons.id, inserted.addons)).catch(() => {})
    if (inserted.groups.length) await db.delete(schema.eventAddonGroups).where(inArray(schema.eventAddonGroups.id, inserted.groups)).catch(() => {})
    if (inserted.types.length) await db.delete(schema.eventTicketTypes).where(inArray(schema.eventTicketTypes.id, inserted.types)).catch(() => {})
    await db.delete(schema.events).where(eq(schema.events.id, copyId)).catch(() => {})
    throw error
  }
})
