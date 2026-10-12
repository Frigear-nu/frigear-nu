import { db, schema } from '@nuxthub/db'
import type { z } from 'zod'
import { newId } from '../../utils'
import { eq } from 'drizzle-orm'
import { eventInput } from './admin-schemas'
import type { addonGroupInput, ticketTypeInput } from './admin-schemas'

type TicketTypeInput = z.output<typeof ticketTypeInput>
type AddonGroupInput = z.output<typeof addonGroupInput>

export async function insertAddonGroup(ticketTypeId: string, input: AddonGroupInput) {
  const { addons, ...group } = input
  const [row] = await db.insert(schema.eventAddonGroups).values({ id: newId('agr'), ticketTypeId, ...group }).returning()
  for (const addon of addons ?? []) {
    await db.insert(schema.eventAddons).values({ id: newId('adn'), groupId: row!.id, ...addon, description: addon.description ?? null, capacity: addon.capacity ?? null })
  }
  return row!
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
  throw createError({ statusCode: 400, statusMessage: 'Membership rules need a membership provider such as @frigear-nu/subscriptions.' })
}

type EventInput = z.output<typeof eventInput>

/** Creates an event, optionally with its whole catalogue (ticket types -> addon groups -> addons). */
export async function createEventWithCatalog(raw: EventInput) {
  const { ticketTypes, ...input } = raw
  await assertMembershipAvailable(input, ...(ticketTypes ?? []))

  const [taken] = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.slug, input.slug)).limit(1)
  if (taken) throw createError({ statusCode: 409, statusMessage: 'An event with this slug already exists.' })

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
  const [row] = await db.update(schema.events).set(patch).where(eq(schema.events.id, id)).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Event not found.' })
  return row
}
