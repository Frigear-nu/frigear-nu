import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, inArray, like, or, sql } from 'drizzle-orm'
import type {
  AddonGroupDto,
  EventDetailDto,
  EventSummaryDto,
  MembershipRequirement,
  TicketDto,
  TicketStatus,
  TicketTypeDto,
} from '../../../types'
import { normalizeMembership } from '../../utils'
import { meetsMembership, passesExclusion } from './membership'

type EventRow = typeof schema.events.$inferSelect
type TicketRow = typeof schema.eventTickets.$inferSelect

/** Tickets that currently occupy a seat: paid ones, and unpaid ones still inside their reservation window. */
export function holdsSeat() {
  const cutoff = new Date(Date.now() - useRuntimeConfig().events.reservationMinutes * 60_000)
  return or(
    eq(schema.eventTickets.status, 'paid'),
    and(eq(schema.eventTickets.status, 'pending'), gt(schema.eventTickets.createdAt, cutoff)),
  )!
}

export async function countSeats(ticketTypeId: string): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(schema.eventTickets)
    .where(and(eq(schema.eventTickets.ticketTypeId, ticketTypeId), holdsSeat()))
  return Number(row?.count ?? 0)
}

export async function countAddonSeats(addonId: string): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(schema.eventTickets)
    .where(and(like(schema.eventTickets.addons, `%"id":"${addonId}"%`), holdsSeat()))
  return Number(row?.count ?? 0)
}

export function toEventSummary(row: EventRow): EventSummaryDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    image: row.image,
    location: row.location,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    requiresMembership: normalizeMembership(row.requiresMembership),
  }
}

export async function listPublishedEvents(): Promise<EventSummaryDto[]> {
  const rows = await db.select().from(schema.events)
    .where(eq(schema.events.status, 'published'))
    .orderBy(asc(schema.events.startsAt))
  return rows.map(toEventSummary)
}

export async function getPublishedEventRow(slug: string): Promise<EventRow | null> {
  const [row] = await db.select().from(schema.events)
    .where(and(eq(schema.events.slug, slug), eq(schema.events.status, 'published')))
    .limit(1)
  return row ?? null
}

/** Loads the catalogue rows of an event: its ticket types with addon groups and addons. */
export async function loadCatalog(eventId: string) {
  const types = await db.select().from(schema.eventTicketTypes)
    .where(eq(schema.eventTicketTypes.eventId, eventId))
    .orderBy(asc(schema.eventTicketTypes.sortOrder), asc(schema.eventTicketTypes.createdAt))
  const typeIds = types.map(type => type.id)
  const groups = typeIds.length
    ? await db.select().from(schema.eventAddonGroups)
        .where(inArray(schema.eventAddonGroups.ticketTypeId, typeIds))
        .orderBy(asc(schema.eventAddonGroups.sortOrder))
    : []
  const groupIds = groups.map(group => group.id)
  const addons = groupIds.length
    ? await db.select().from(schema.eventAddons)
        .where(inArray(schema.eventAddons.groupId, groupIds))
        .orderBy(asc(schema.eventAddons.sortOrder))
    : []
  return { types, groups, addons }
}

/**
 * The public event detail. For a signed-in user (`userId`) each ticket type also says whether they
 * may buy it (`blocked`), so the UI can disable it with the right badge.
 */
export async function getEventDetail(row: EventRow, userId?: number): Promise<EventDetailDto> {
  const { types, groups, addons } = await loadCatalog(row.id)
  const eventRequirement = normalizeMembership(row.requiresMembership)
  const now = Date.now()

  const ticketTypes: TicketTypeDto[] = await Promise.all(types.map(async (type) => {
    const seats = type.capacity === null ? null : await countSeats(type.id)
    const remaining = type.capacity === null ? null : Math.max(type.capacity - (seats ?? 0), 0)
    const saleState: TicketTypeDto['saleState'] = type.saleStartsAt && type.saleStartsAt.getTime() > now
      ? 'not_started'
      : type.saleEndsAt && type.saleEndsAt.getTime() < now
        ? 'ended'
        : remaining === 0 ? 'sold_out' : 'open'

    const typeRequirement = normalizeMembership(type.requiresMembership)
    const typeExclusion = normalizeMembership(type.excludesMembership)
    let blocked: TicketTypeDto['blocked'] = null
    if (userId !== undefined) {
      if (!(await meetsMembership(userId, eventRequirement)) || !(await meetsMembership(userId, typeRequirement))) blocked = 'membership_required'
      else if (!(await passesExclusion(userId, typeExclusion))) blocked = 'membership_excluded'
      else {
        const [owned] = await db.select({ count: sql<number>`count(*)` }).from(schema.eventTickets)
          .where(and(
            eq(schema.eventTickets.userId, userId),
            eq(schema.eventTickets.ticketTypeId, type.id),
            holdsSeat(),
          ))
        if (Number(owned?.count ?? 0) >= type.maxPerUser) blocked = 'limit_reached'
      }
    }

    const addonGroups: AddonGroupDto[] = await Promise.all(groups.filter(group => group.ticketTypeId === type.id).map(async group => ({
      id: group.id,
      title: group.title,
      required: group.required,
      multiple: group.multiple,
      addons: await Promise.all(addons.filter(addon => addon.groupId === group.id).map(async addon => ({
        id: addon.id,
        label: addon.label,
        description: addon.description ?? null,
        price: addon.price,
        soldOut: addon.capacity !== null && (await countAddonSeats(addon.id)) >= addon.capacity,
      }))),
    })))

    return {
      id: type.id,
      key: type.key,
      name: type.name,
      description: type.description ?? null,
      price: type.price,
      currency: type.currency,
      hidePrice: type.hidePrice,
      isDefault: type.isDefault,
      requiresMembership: typeRequirement as MembershipRequirement,
      excludesMembership: typeExclusion as MembershipRequirement,
      remaining,
      saleStartsAt: type.saleStartsAt?.toISOString() ?? null,
      saleEndsAt: type.saleEndsAt?.toISOString() ?? null,
      saleState,
      blocked,
      addonGroups,
    }
  }))

  return { ...toEventSummary(row), body: row.body ?? null, locationUrl: row.locationUrl, ticketTypes }
}

/** Maps ticket rows to DTOs (joining event + ticket type names). The QR `code` only goes out for paid tickets. */
export async function toTicketDtos(rows: TicketRow[]): Promise<TicketDto[]> {
  if (!rows.length) return []
  const eventRows = await db.select().from(schema.events).where(inArray(schema.events.id, [...new Set(rows.map(row => row.eventId))]))
  const typeRows = await db.select().from(schema.eventTicketTypes).where(inArray(schema.eventTicketTypes.id, [...new Set(rows.map(row => row.ticketTypeId))]))
  const eventsById = new Map(eventRows.map(row => [row.id, row]))
  const typesById = new Map(typeRows.map(row => [row.id, row]))

  return rows.map((row) => {
    const event = eventsById.get(row.eventId)
    return {
      id: row.id,
      eventId: row.eventId,
      eventSlug: event?.slug ?? '',
      eventName: event?.name ?? '',
      startsAt: event?.startsAt.toISOString() ?? row.createdAt.toISOString(),
      ticketTypeId: row.ticketTypeId,
      ticketTypeName: typesById.get(row.ticketTypeId)?.name ?? '',
      status: row.status as TicketStatus,
      addons: row.addons,
      amount: row.amount,
      currency: row.currency,
      paymentId: row.paymentId,
      code: row.status === 'paid' ? row.code : null,
      checkedInAt: row.checkedInAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }
  })
}
