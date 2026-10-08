import type { H3Event } from 'h3'

/** A text that is either one string or a map of locale -> string. */
export type Translated = string | Record<string, string>

/** `null` = open to everyone, `'any'` = any active subscription, or a list of plan keys. */
export type MembershipRequirement = 'any' | string[] | null

export type EventStatus = 'draft' | 'published' | 'archived'
export type TicketStatus = 'pending' | 'paid' | 'cancelled' | 'refunded' | 'expired'

export type ModuleOptions = {
  settings?: {
    pages?: {
      /** Event list. `true` = `/events`. */
      events?: string | boolean
      /** Event detail; must contain a `:slug` param. `true` = `/events/:slug`. */
      event?: string | boolean
      /** The signed-in user's tickets. `true` = `/account/tickets`. */
      tickets?: string | boolean
    }
    /** Minutes an unpaid ticket keeps its seat (the Stripe session expires then). Defaults to `30`. */
    reservationMinutes?: number
  }
}

export type EventsRuntimeConfig = {
  reservationMinutes: number
  /** Whether `@frigear-nu/subscriptions` is installed (membership requirements can be evaluated). */
  membershipEnabled: boolean
}

export type PublicModuleOptions = {
  pages: { events?: string, event?: string, tickets?: string }
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
  /** Seats left, or null when unlimited. */
  remaining: number | null
  saleStartsAt: string | null
  saleEndsAt: string | null
  /** `open | not_started | ended | sold_out`. */
  saleState: 'open' | 'not_started' | 'ended' | 'sold_out'
  /** Only set for signed-in users: `null` when allowed, otherwise why not. */
  blocked: 'membership_required' | 'limit_reached' | null
  addonGroups: AddonGroupDto[]
}

export type EventSummaryDto = {
  id: string
  slug: string
  name: Translated
  description: Translated | null
  image: string | null
  location: string | null
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
}

export type CheckInResponse = {
  ok: boolean
  alreadyCheckedIn: boolean
  checkedInAt: string
  ticket: TicketDto
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

export type TicketHookContext = {
  ticket: TicketDto
}
