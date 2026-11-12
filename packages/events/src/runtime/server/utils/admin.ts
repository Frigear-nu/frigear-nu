import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import type { z } from 'zod'
import { newId } from '../../utils'
import { and, asc, eq } from 'drizzle-orm'
import { badRequest, conflict, notFound } from '@frigear-nu/module-kit/server'
import { loadCatalog } from './catalog'
import { eventInput, ticketTypeInput } from './admin-schemas'
import { eventsAccess } from '../../access'
import type { addonGroupInput } from './admin-schemas'

type TicketTypeInput = z.output<typeof ticketTypeInput>
type AddonGroupInput = z.output<typeof addonGroupInput>

/** The permissions whose record-level policies run on one event. */
export type EventsRecordPermission = typeof eventsAccess.permissions.manage | typeof eventsAccess.permissions.refund

/**
 * Loads the event `eventId` (404 `not_found`) and authorizes `permission` on it. Every record-level check of
 * `events:manage` and `events:refund` goes through here, so their policies always receive the stored EVENT row
 * (`typeof schema.events.$inferSelect`), never a ticket type, addon or ticket: a route acting on a child record passes
 * the event it belongs to. Call it after `authorize(event, permission)` without a record, so a caller who may not do the
 * action at all gets 401/403 before any 404. Returns the event row.
 */
export async function authorizeEventsRecord(event: H3Event, eventId: string, permission: EventsRecordPermission = eventsAccess.permissions.manage) {
  const [row] = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1)
  if (!row) throw notFound('Event not found.')
  await authorize(event, permission, row)
  return row
}

/** The event a ticket type belongs to (404 `not_found` for an unknown ticket type). */
export async function eventsIdOfTicketType(ticketTypeId: string): Promise<string> {
  const [row] = await db.select({ eventId: schema.eventTicketTypes.eventId }).from(schema.eventTicketTypes).where(eq(schema.eventTicketTypes.id, ticketTypeId)).limit(1)
  if (!row) throw notFound('Ticket type not found.')
  return row.eventId
}

/** The event an addon group belongs to, through its ticket type (404 `not_found` for an unknown addon group). */
export async function eventsIdOfAddonGroup(groupId: string): Promise<string> {
  const [row] = await db.select({ eventId: schema.eventTicketTypes.eventId }).from(schema.eventAddonGroups)
    .innerJoin(schema.eventTicketTypes, eq(schema.eventAddonGroups.ticketTypeId, schema.eventTicketTypes.id))
    .where(eq(schema.eventAddonGroups.id, groupId)).limit(1)
  if (!row) throw notFound('Addon group not found.')
  return row.eventId
}

/** The event an addon belongs to, through its group and ticket type (404 `not_found` for an unknown addon). */
export async function eventsIdOfAddon(addonId: string): Promise<string> {
  const [row] = await db.select({ eventId: schema.eventTicketTypes.eventId }).from(schema.eventAddons)
    .innerJoin(schema.eventAddonGroups, eq(schema.eventAddons.groupId, schema.eventAddonGroups.id))
    .innerJoin(schema.eventTicketTypes, eq(schema.eventAddonGroups.ticketTypeId, schema.eventTicketTypes.id))
    .where(eq(schema.eventAddons.id, addonId)).limit(1)
  if (!row) throw notFound('Addon not found.')
  return row.eventId
}

export async function insertAddonGroup(ticketTypeId: string, input: AddonGroupInput) {
  const { addons, ...group } = input
  const [row] = await db.insert(schema.eventAddonGroups).values({ id: newId('agr'), ticketTypeId, ...group }).returning()
  for (const addon of addons ?? []) {
    await db.insert(schema.eventAddons).values({ id: newId('adn'), groupId: row!.id, ...addon, description: addon.description ?? null, capacity: addon.capacity ?? null })
  }
  return row!
}

/** 409 when another ticket type of `eventId` already uses `key` (keys are unique per event). */
export async function assertTicketTypeKeyFree(eventId: string, key: string, exceptId?: string) {
  const [taken] = await db.select({ id: schema.eventTicketTypes.id }).from(schema.eventTicketTypes)
    .where(and(eq(schema.eventTicketTypes.eventId, eventId), eq(schema.eventTicketTypes.key, key)))
    .limit(1)
  if (taken && taken.id !== exceptId) throw conflict('A ticket type with this key already exists on the event.', { field: 'key' })
}

export async function insertTicketType(eventId: string, input: TicketTypeInput) {
  const { addonGroups, ...type } = input
  const [row] = await db.insert(schema.eventTicketTypes).values({
    id: newId('ttp'),
    eventId,
    ...type,
    capacity: type.capacity ?? null,
    saleStartsAt: type.saleStartsAt ?? null,
    saleEndsAt: type.saleEndsAt ?? null,
    saleSchedule: type.saleSchedule ?? null,
    requiresMembership: type.requiresMembership ?? null,
    excludesMembership: type.excludesMembership ?? null,
  }).returning()
  for (const group of addonGroups ?? []) await insertAddonGroup(row!.id, group)
  return row!
}

/**
 * Membership rules only make sense with a membership provider (`@frigear-nu/subscriptions`): without one a
 * requirement could never be met (and would silently lock the ticket), so staff can't set one.
 */
export async function assertMembershipAvailable(...inputs: Array<{ requiresMembership?: unknown, excludesMembership?: unknown } | undefined>) {
  if (!inputs.some(input => input?.requiresMembership || input?.excludesMembership)) return
  if ((await getMembershipOptions()).available) return
  throw badRequest('Membership rules need a membership provider such as @frigear-nu/subscriptions.')
}

type EventInput = z.output<typeof eventInput>

/** Creates an event, optionally with its whole catalogue (ticket types -> addon groups -> addons). */
export async function createEventWithCatalog(raw: EventInput) {
  const { ticketTypes, ...input } = raw
  await assertMembershipAvailable(input, ...(ticketTypes ?? []))

  const [taken] = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.slug, input.slug)).limit(1)
  if (taken) throw conflict('An event with this slug already exists.', { field: 'slug' })

  const [row] = await db.insert(schema.events).values({
    id: newId('evn'),
    ...input,
    requiresMembership: input.requiresMembership ?? null,
  }).returning()
  for (const type of ticketTypes ?? []) await insertTicketType(row!.id, type)
  return row!
}

export const eventPatchSchema = eventInput.omit({ ticketTypes: true }).partial()

export async function patchEventRow(id: string, patch: z.output<typeof eventPatchSchema>) {
  await assertMembershipAvailable(patch)
  if (patch.slug) {
    const [taken] = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.slug, patch.slug)).limit(1)
    if (taken && taken.id !== id) throw conflict('An event with this slug already exists.', { field: 'slug' })
  }
  const [row] = await db.update(schema.events).set(patch).where(eq(schema.events.id, id)).returning()
  if (!row) throw notFound('Event not found.')
  return row
}

// Addon groups have their own endpoints; a ticket type patch only changes the type's own fields.
export const ticketTypePatchSchema = ticketTypeInput.omit({ addonGroups: true }).partial()

export async function patchTicketTypeRow(id: string, patch: z.output<typeof ticketTypePatchSchema>) {
  await assertMembershipAvailable(patch)
  if (patch.key) {
    const [current] = await db.select({ eventId: schema.eventTicketTypes.eventId }).from(schema.eventTicketTypes).where(eq(schema.eventTicketTypes.id, id)).limit(1)
    if (!current) throw notFound('Ticket type not found.')
    await assertTicketTypeKeyFree(current.eventId, patch.key, id)
  }
  const [row] = await db.update(schema.eventTicketTypes).set(patch).where(eq(schema.eventTicketTypes.id, id)).returning()
  if (!row) throw notFound('Ticket type not found.')
  return row
}

/** One event with all of its ticket types (capacity and sale window included), whatever its status. */
export async function getEventWithTicketTypes(id: string) {
  const [row] = await db.select().from(schema.events).where(eq(schema.events.id, id)).limit(1)
  if (!row) throw notFound('Event not found.')
  const ticketTypes = await db.select().from(schema.eventTicketTypes)
    .where(eq(schema.eventTicketTypes.eventId, id))
    .orderBy(asc(schema.eventTicketTypes.sortOrder))
  const { groups, addons } = await loadCatalog(id)
  return {
    ...row,
    ticketTypes: ticketTypes.map(type => ({
      ...type,
      addonGroups: groups
        .filter(group => group.ticketTypeId === type.id)
        .map(group => ({ ...group, addons: addons.filter(addon => addon.groupId === group.id) })),
    })),
  }
}
