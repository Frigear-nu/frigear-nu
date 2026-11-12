// Pure helpers, safe to import from the Vue app as well as Nitro code.
import { translate } from '@frigear-nu/ui/translated'
import { formatMoney as formatPrice } from '@frigear-nu/ui/money'
import type { MembershipRequirement } from '../types'

export { translate }
export * from './links'
export * from './api'

export type {
  AddonDto,
  AdminAddonDto,
  AdminAddonGroupDto,
  AdminEventDetailDto,
  AdminEventDto,
  AdminTicketTypeDto,
  AttendeeDto,
  AddonGroupDto,
  CheckInResponse,
  EventDetailDto,
  EventStatus,
  EventSummaryDto,
  MembershipOptionsDto,
  MembershipRequirement,
  ModuleOptions,
  PurchaseBeforeContext,
  PurchaseBody,
  PurchaseResponse,
  TicketDto,
  TicketHookContext,
  TicketStatus,
  TicketTypeDto,
  Translated,
  UpcomingEventsDto,
} from '../types'

/** The currency tickets and add-ons are sold in unless they say otherwise (the column default). */
export const DEFAULT_CURRENCY = 'DKK'

/** Normalises a stored requirement: empty plan lists mean "any active subscription". */
export function normalizeMembership(value: MembershipRequirement | undefined): MembershipRequirement {
  if (value === 'any') return 'any'
  if (Array.isArray(value)) return value.length ? value : 'any'
  return null
}

/** Random, prefixed id (`tkt_...`), Web Crypto only so it works on Workers. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}

/** A longer random token for ticket QR codes. */
export function newTicketCode(): string {
  return `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
}

/**
 * Variables a ticket type's description can use in MDC (`{{ticket}}`, `{{price}}`, ...).
 * `ticket` is the ticket's name; the rest describe the same ticket.
 */
export function ticketMdcData(
  type: { name: unknown, price: number, currency: string, hidePrice?: boolean, remaining?: number | null, key?: string },
  name: string,
  locale = 'en',
): Record<string, unknown> {
  return {
    ticket: name,
    name,
    key: type.key,
    price: type.price === 0 ? 'Free' : formatPrice(type.price, type.currency, locale),
    amount: type.price,
    currency: type.currency,
    hidePrice: !!type.hidePrice,
    remaining: type.remaining ?? null,
  }
}
