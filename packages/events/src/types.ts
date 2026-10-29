import type { H3Event } from 'h3'

import type { Translated } from '@frigear-nu/ui/translated'
import type { Schedule } from '@frigear-nu/module-kit/schedule'

export type { Translated }

/** `null` = open to everyone, `'any'` = any active subscription, or a list of plan keys. */
export type MembershipRequirement = 'any' | string[] | null

export type EventStatus = 'draft' | 'published' | 'archived'
export type TicketStatus = 'pending' | 'paid' | 'cancelled' | 'refunded' | 'expired'

export type ModuleOptions = {
  settings?: {
    // Expose this module's MCP tools, resources and prompts on the MCP endpoint. Defaults to `false`.
    mcp?: boolean
    pages?: {
      /** Event list. `true` = `/events`. */
      events?: string | boolean
      /** Event detail; must contain a `:slug` param. `true` = `/events/:slug`. */
      event?: string | boolean
      /** The signed-in user's tickets. `true` = `/account/tickets`. */
      tickets?: string | boolean
      /** Staff event list (needs the `events:authorize` hook to allow staff). `true` = `/admin/events`. Off by default. */
      admin?: string | boolean
      /** Staff event page (details, ticket types, attendees); must contain an `:id` param. `true` = `/admin/events/:id`. Off by default. */
      adminEvent?: string | boolean
    }
    /** Minutes an unpaid ticket keeps its seat (the Stripe session expires then). Defaults to `30`. */
    reservationMinutes?: number
  }
}

export type EventsRuntimeConfig = {
  reservationMinutes: number
}

export type PublicModuleOptions = {
  pages: { events?: string, event?: string, tickets?: string, admin?: string, adminEvent?: string }
}

export type AddonDto = {
  id: string
  label: Translated
  description: Translated | null
  price: number
  soldOut: boolean
}

export type AddonGroupDto = {
  id: string
  title: Translated
  required: boolean
  multiple: boolean
  addons: AddonDto[]
}

export type TicketTypeDto = {
  id: string
  key: string
  name: Translated
  description: Translated | null
  price: number
  currency: string
  hidePrice: boolean
  isDefault: boolean
  requiresMembership: MembershipRequirement
  /** Holders of these plans cannot buy this ticket (`'any'` = any active subscription). */
  excludesMembership: MembershipRequirement
  /** Seats left, or null when unlimited. */
  remaining: number | null
  saleStartsAt: string | null
  saleEndsAt: string | null
  /** `open | not_started | ended | sold_out`. */
  saleState: 'open' | 'not_started' | 'ended' | 'sold_out'
  /** Only set for signed-in users: `null` when allowed, otherwise why not. */
  blocked: 'membership_required' | 'membership_excluded' | 'limit_reached' | null
  addonGroups: AddonGroupDto[]
}

export type EventSummaryDto = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  image: string | null
  location: Translated | null
  startsAt: string
  endsAt: string | null
  requiresMembership: MembershipRequirement
}

export type EventDetailDto = EventSummaryDto & {
  body: Translated | null
  locationUrl: string | null
  ticketTypes: TicketTypeDto[]
}

export type PurchaseBody = {
  ticketTypeId: string
  addonIds?: string[]
  successUrl?: string
  cancelUrl?: string
  /** The buyer's site language (e.g. `da`), kept on the ticket so later mails and Stripe texts use it. */
  locale?: string
}

export type PurchaseResponse = {
  ticket: TicketDto
  /** Redirect target for paid tickets; absent when the ticket was free and is already `paid`. */
  url?: string
}

export type TicketDto = {
  id: string
  eventId: string
  eventSlug: string
  eventName: Translated
  startsAt: string
  ticketTypeId: string
  ticketTypeName: Translated
  status: TicketStatus
  addons: Array<{ id: string, label: Translated, price: number }>
  amount: number
  currency: string
  paymentId: string | null
  /** The QR payload; only included for paid tickets. */
  code: string | null
  checkedInAt: string | null
  createdAt: string
  /** Language the buyer was browsing in when buying, for localised mails; `null` for tickets bought before it was kept. */
  locale: string | null
}

export type CheckInResponse = {
  ok: boolean
  alreadyCheckedIn: boolean
  checkedInAt: string
  ticket: TicketDto
}

/** An event as staff see it (`/api/admin/events`): every field, whatever its status. Dates are ISO strings. */
export type AdminEventDto = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  body: Translated | null
  image: string | null
  location: Translated | null
  locationUrl: string | null
  startsAt: string
  endsAt: string | null
  status: EventStatus
  requiresMembership: MembershipRequirement
  createdAt: string
  updatedAt: string
}

/** A ticket type as staff see it, with its capacity, sale window and membership rules. */
export type AdminTicketTypeDto = {
  id: string
  eventId: string
  key: string
  name: Translated
  description: Translated | null
  price: number
  currency: string
  hidePrice: boolean
  capacity: number | null
  saleStartsAt: string | null
  saleEndsAt: string | null
  saleSchedule: Schedule | null
  maxPerUser: number
  requiresMembership: MembershipRequirement
  excludesMembership: MembershipRequirement
  isDefault: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** An add-on group of a ticket type, as staff see it. */
export type AdminAddonGroupDto = {
  id: string
  ticketTypeId: string
  title: Translated
  required: boolean
  multiple: boolean
  sortOrder: number
}

/** An add-on (one choice of a group), as staff see it. */
export type AdminAddonDto = {
  id: string
  groupId: string
  label: Translated
  description: Translated | null
  price: number
  capacity: number | null
  sortOrder: number
}

/** One event with its whole catalogue (`GET /api/admin/events/:id`). */
export type AdminEventDetailDto = AdminEventDto & {
  ticketTypes: Array<AdminTicketTypeDto & { addonGroups: Array<AdminAddonGroupDto & { addons: AdminAddonDto[] }> }>
}

/** One ticket of an event with its holder (`GET /api/admin/events/:id/tickets`). `code` is there for staff check-in. */
export type AttendeeDto = {
  id: string
  eventId: string
  ticketTypeId: string
  userId: number
  status: TicketStatus
  addons: Array<{ id: string, label: Translated, price: number }>
  amount: number
  currency: string
  paymentId: string | null
  code: string
  locale: string | null
  checkedInAt: string | null
  createdAt: string
  userName: string | null
  userEmail: string | null
}

/** The admin dashboard's upcoming events (`GET /api/admin/events/upcoming`). */
export type UpcomingEventsDto = {
  total: number
  items: Array<{ id: string, name: Translated, location: Translated | null, startsAt: string }>
}

/** What a membership provider offers (`GET /api/admin/events/membership-options`). */
export type MembershipOptionsDto = {
  available: boolean
  options: MembershipOption[]
}

export type PurchaseBeforeContext = {
  event: H3Event
  userId: number
  eventId: string
  ticketTypeId: string
  addonIds: string[]
}

export type AuthorizeContext = {
  event: H3Event
  userId: number
  /** Set `ctx.allowed = true` to let the user manage events / check tickets in. Denied by default. */
  allowed: boolean
}

/** A selectable membership (plan) offered by a membership provider. */
export type MembershipOption = { value: string, label: string }

/** Context of the `events:membership:check` hook. */
export type MembershipCheckContext = {
  userId: number
  /** `'any'` = any active membership, or the plan keys of which the user must hold one. */
  requirement: 'any' | string[]
  /** A provider sets this to `true` when the user holds a matching membership. Defaults to `false`. */
  satisfied: boolean
}

/** Context of the `events:membership:options` hook. */
export type MembershipOptionsContext = {
  /** A provider sets this to `true`: membership rules can then be used on events and tickets. */
  available: boolean
  /** The memberships staff can pick from. */
  options: MembershipOption[]
}

export type TicketHookContext = {
  ticket: TicketDto
}
