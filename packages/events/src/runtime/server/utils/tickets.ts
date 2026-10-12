import { db, schema } from '@nuxthub/db'
import { and, eq, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { PurchaseBody, PurchaseResponse, TicketDto } from '../../../types'
import { newId, newTicketCode, normalizeMembership, resolveSameOriginUrl, translate } from '../../utils'
import { countAddonSeats, countSeats, getPublishedEventRow, holdsSeat, loadCatalog, toTicketDtos } from './catalog'
import { meetsMembership, passesExclusion } from './membership'

const fail = (statusCode: number, statusMessage: string) => createError({ statusCode, statusMessage })

function returnUrls(event: H3Event, slug: string, ticketId: string, body: PurchaseBody) {
  const origin = getRequestURL(event).origin
  const pages = useRuntimeConfig().public.events?.pages ?? {}
  const eventPath = (pages.event || '/events/:slug').replace(':slug', encodeURIComponent(slug))
  const resolve = (input: string | undefined, status: 'success' | 'cancel', name: string) => {
    if (input) {
      const safe = resolveSameOriginUrl(input, origin)
      if (!safe) throw fail(400, `${name} must be a relative path or an URL on the same origin.`)
      return safe
    }
    return `${origin}${eventPath}?ticket=${ticketId}&payment=${status}`
  }
  return { successUrl: resolve(body.successUrl, 'success', 'successUrl'), cancelUrl: resolve(body.cancelUrl, 'cancel', 'cancelUrl') }
}

/** Frees the seat of a ticket the purchase could not complete. */
async function release(ticketId: string, status: 'cancelled' | 'expired' = 'cancelled') {
  await db.update(schema.eventTickets).set({ status }).where(eq(schema.eventTickets.id, ticketId))
}

/**
 * The whole purchase: validates the request against the catalogue, takes a seat, and either issues a
 * free ticket straight away or hands off to `@frigear-nu/payments` (the ticket turns `paid` when the
 * `payments:paid` hook fires, see `plugins/payment-hooks.ts`).
 */
export async function purchaseTicket(event: H3Event, userId: number, slug: string, body: PurchaseBody): Promise<PurchaseResponse> {
  const eventRow = await getPublishedEventRow(slug)
  if (!eventRow) throw fail(404, 'Event not found.')
  if (eventRow.endsAt ? eventRow.endsAt.getTime() < Date.now() : eventRow.startsAt.getTime() < Date.now() - 24 * 3600_000) {
    throw fail(409, 'This event is over.')
  }

  const { types, groups, addons } = await loadCatalog(eventRow.id)
  const type = types.find(item => item.id === body.ticketTypeId)
  if (!type) throw fail(404, 'Ticket type not found.')

  // --- Sale window ---------------------------------------------------------------------------
  const window = saleWindow(type)
  if (window.state === 'not_started') throw fail(409, 'Ticket sales have not started yet.')
  if (window.state === 'ended') throw fail(409, 'Ticket sales have ended.')

  // --- Membership (event level AND ticket level; fails closed if subscriptions is missing) ----
  const requirements = [normalizeMembership(eventRow.requiresMembership), normalizeMembership(type.requiresMembership)]
  for (const requirement of requirements) {
    if (!(await meetsMembership(userId, requirement))) throw fail(403, 'An active membership is required for this ticket.')
  }
  if (!(await passesExclusion(userId, normalizeMembership(type.excludesMembership)))) throw fail(403, 'This ticket is not available for your membership.')

  // --- Addons --------------------------------------------------------------------------------
  const typeGroups = groups.filter(group => group.ticketTypeId === type.id)
  const typeAddons = addons.filter(addon => typeGroups.some(group => group.id === addon.groupId))
  const addonIds = [...new Set(body.addonIds ?? [])]
  const chosen = addonIds.map((id) => {
    const addon = typeAddons.find(item => item.id === id)
    if (!addon) throw fail(400, `Addon ${id} does not belong to this ticket type.`)
    return addon
  })
  for (const group of typeGroups) {
    const inGroup = chosen.filter(addon => addon.groupId === group.id)
    if (group.required && inGroup.length === 0) throw fail(400, `Choose an option for "${translate(group.title, body.locale)}".`)
    if (!group.multiple && inGroup.length > 1) throw fail(400, `Only one option can be chosen for "${translate(group.title, body.locale)}".`)
  }
  for (const addon of chosen) {
    if (addon.capacity !== null && (await countAddonSeats(addon.id)) >= addon.capacity) throw fail(409, `"${translate(addon.label, body.locale)}" is sold out.`)
  }

  if (type.capacity !== null && (await countSeats(type.id)) >= type.capacity) throw fail(409, 'This ticket type is sold out.')

  // --- Host policy ---------------------------------------------------------------------------
  await useNitroApp().hooks.callHook('events:purchase:before', { event, userId, eventId: eventRow.id, ticketTypeId: type.id, addonIds })

  // --- Per-user limit ------------------------------------------------------------------------
  const [owned] = await db.select({ count: sql<number>`count(*)` }).from(schema.eventTickets)
    .where(and(eq(schema.eventTickets.userId, userId), eq(schema.eventTickets.ticketTypeId, type.id), holdsSeat()))
  if (Number(owned?.count ?? 0) >= type.maxPerUser) throw fail(409, 'You have reached the ticket limit for this ticket type.')

  // --- Take the seat -------------------------------------------------------------------------
  const amount = type.price + chosen.reduce((total, addon) => total + addon.price, 0)
  const id = newId('tkt')
  const [inserted] = await db.insert(schema.eventTickets).values({
    id,
    eventId: eventRow.id,
    ticketTypeId: type.id,
    userId,
    locale: body.locale ?? null,
    status: amount === 0 ? 'paid' : 'pending',
    addons: chosen.map(addon => ({ id: addon.id, label: addon.label, price: addon.price })),
    amount,
    currency: type.currency,
    code: newTicketCode(),
  }).returning()

  // The check above and the insert are not atomic (D1 has no interactive transactions), so verify
  // after the fact: the first `capacity` seat holders, in insertion (rowid) order, keep their seat; a ticket
  // that lost the race removes itself. Concurrent buyers reach the same verdict.
  if (type.capacity !== null) {
    const winners = await db.select({ id: schema.eventTickets.id }).from(schema.eventTickets)
      .where(and(eq(schema.eventTickets.ticketTypeId, type.id), holdsSeat()))
      .orderBy(sql`rowid`)
      .limit(type.capacity)
    if (!winners.some(winner => winner.id === id)) {
      await release(id)
      throw fail(409, 'This ticket type is sold out.')
    }
  }
  for (const addon of chosen.filter(item => item.capacity !== null)) {
    const winners = await db.select({ id: schema.eventTickets.id }).from(schema.eventTickets)
      .where(and(sql`${schema.eventTickets.addons} like ${`%"id":"${addon.id}"%`}`, holdsSeat()))
      .orderBy(sql`rowid`)
      .limit(addon.capacity!)
    if (!winners.some(winner => winner.id === id)) {
      await release(id)
      throw fail(409, `"${translate(addon.label, body.locale)}" is sold out.`)
    }
  }

  const [dto] = await toTicketDtos([inserted!])

  // --- Free: done. Paid: hand off to payments -------------------------------------------------
  if (amount === 0) {
    await useNitroApp().hooks.callHook('events:ticket:paid', { ticket: dto! })
    return { ticket: dto! }
  }

  try {
    const urls = returnUrls(event, eventRow.slug, id, body)
    const { payment, url } = await createPayment({
      userId,
      description: `${translate(eventRow.name, body.locale)} - ${translate(type.name, body.locale)}`,
      items: [
        ...(type.price > 0 ? [{ name: `${translate(eventRow.name, body.locale)} - ${translate(type.name, body.locale)}`, amount: type.price, currency: type.currency }] : []),
        ...chosen.filter(addon => addon.price > 0).map(addon => ({ name: translate(addon.label, body.locale), amount: addon.price, currency: type.currency })),
      ],
      reference: { type: 'event_ticket', id },
      expiresInMinutes: useRuntimeConfig().events.reservationMinutes,
      ...urls,
    }, event)
    await db.update(schema.eventTickets).set({ paymentId: payment.id }).where(eq(schema.eventTickets.id, id))
    const [withPayment] = await toTicketDtos([{ ...inserted!, paymentId: payment.id }])
    return { ticket: withPayment!, url }
  }
  catch (error) {
    await release(id)
    throw error
  }
}

export async function listUserTickets(userId: number): Promise<TicketDto[]> {
  const rows = await db.select().from(schema.eventTickets)
    .where(eq(schema.eventTickets.userId, userId))
    .orderBy(sql`${schema.eventTickets.createdAt} desc`)
  return toTicketDtos(rows)
}

export async function getUserTicket(userId: number, ticketId: string): Promise<TicketDto> {
  const [row] = await db.select().from(schema.eventTickets)
    .where(and(eq(schema.eventTickets.id, ticketId), eq(schema.eventTickets.userId, userId)))
    .limit(1)
  if (!row) throw fail(404, 'Ticket not found.')
  const [dto] = await toTicketDtos([row])
  return dto!
}
