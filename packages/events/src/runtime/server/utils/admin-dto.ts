import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import { isoDate } from '@frigear-nu/module-kit/server'
import type {
  AdminAddonDto,
  AdminAddonGroupDto,
  AdminEventDetailDto,
  AdminEventDto,
  AdminTicketTypeDto,
  AttendeeDto,
  EventStatus,
  TicketStatus,
} from '../../../types'
import { normalizeMembership } from '../../utils'

type EventRow = typeof schema.events.$inferSelect
type TicketTypeRow = typeof schema.eventTicketTypes.$inferSelect
type AddonGroupRow = typeof schema.eventAddonGroups.$inferSelect
type AddonRow = typeof schema.eventAddons.$inferSelect
type TicketRow = typeof schema.eventTickets.$inferSelect

// Explicit allowlists of what staff routes return: a column added to a table never leaks into a response by itself.

export function toAdminEventDto(row: EventRow): AdminEventDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    body: row.body ?? null,
    image: row.image ?? null,
    location: row.location ?? null,
    locationUrl: row.locationUrl ?? null,
    startsAt: isoDate(row.startsAt),
    endsAt: isoDate(row.endsAt),
    status: row.status as EventStatus,
    requiresMembership: normalizeMembership(row.requiresMembership ?? undefined),
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

export function toAdminTicketTypeDto(row: TicketTypeRow): AdminTicketTypeDto {
  return {
    id: row.id,
    eventId: row.eventId,
    key: row.key,
    name: row.name,
    description: row.description ?? null,
    price: row.price,
    currency: row.currency,
    hidePrice: row.hidePrice,
    capacity: row.capacity ?? null,
    saleStartsAt: isoDate(row.saleStartsAt),
    saleEndsAt: isoDate(row.saleEndsAt),
    saleSchedule: row.saleSchedule ?? null,
    maxPerUser: row.maxPerUser,
    requiresMembership: normalizeMembership(row.requiresMembership ?? undefined),
    excludesMembership: normalizeMembership(row.excludesMembership ?? undefined),
    isDefault: row.isDefault,
    sortOrder: row.sortOrder,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

export function toAdminAddonGroupDto(row: AddonGroupRow): AdminAddonGroupDto {
  return {
    id: row.id,
    ticketTypeId: row.ticketTypeId,
    title: row.title,
    required: row.required,
    multiple: row.multiple,
    sortOrder: row.sortOrder,
  }
}

export function toAdminAddonDto(row: AddonRow): AdminAddonDto {
  return {
    id: row.id,
    groupId: row.groupId,
    label: row.label,
    description: row.description ?? null,
    price: row.price,
    capacity: row.capacity ?? null,
    sortOrder: row.sortOrder,
  }
}

/** The result of `getEventWithTicketTypes` as a DTO. */
export function toAdminEventDetailDto(row: EventRow & {
  ticketTypes: Array<TicketTypeRow & { addonGroups: Array<AddonGroupRow & { addons: AddonRow[] }> }>
}): AdminEventDetailDto {
  return {
    ...toAdminEventDto(row),
    ticketTypes: row.ticketTypes.map(type => ({
      ...toAdminTicketTypeDto(type),
      addonGroups: type.addonGroups.map(group => ({
        ...toAdminAddonGroupDto(group),
        addons: group.addons.map(toAdminAddonDto),
      })),
    })),
  }
}

/** A ticket with its holder, for staff. Keeps the QR `code` (staff check tickets in with it). */
export function toAttendeeDto(row: TicketRow, holder: { name: string | null, email: string | null }): AttendeeDto {
  return {
    id: row.id,
    eventId: row.eventId,
    ticketTypeId: row.ticketTypeId,
    userId: row.userId,
    status: row.status as TicketStatus,
    addons: row.addons,
    amount: row.amount,
    currency: row.currency,
    paymentId: row.paymentId ?? null,
    code: row.code,
    locale: row.locale ?? null,
    checkedInAt: isoDate(row.checkedInAt),
    createdAt: isoDate(row.createdAt),
    userName: holder.name,
    userEmail: holder.email,
  }
}

/** The name and email of a ticket's holder, for `toAttendeeDto`. */
export async function ticketHolder(userId: number): Promise<{ name: string | null, email: string | null }> {
  const [user] = await db.select({ name: schema.users.name, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  return { name: user?.name ?? null, email: user?.email ?? null }
}
