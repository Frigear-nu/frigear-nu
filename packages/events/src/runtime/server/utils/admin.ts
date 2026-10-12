import { db, schema } from '@nuxthub/db'
import type { z } from 'zod'
import { newId } from '../../utils'
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
