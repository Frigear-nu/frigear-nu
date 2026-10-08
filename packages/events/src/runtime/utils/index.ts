// Pure helpers, safe to import from the Vue app as well as Nitro code.
import type { MembershipRequirement, Translated } from '../types'

export type {
  AddonDto,
  AddonGroupDto,
  AuthorizeContext,
  CheckInResponse,
  EventDetailDto,
  EventStatus,
  EventSummaryDto,
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
} from '../types'

/** Picks the text for a locale, falling back to `en`, then to the first available entry. */
export function translate(value: Translated | null | undefined, locale = 'en'): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value[locale] ?? value.en ?? Object.values(value)[0] ?? ''
}

/** Formats minor units, e.g. `formatPrice(15000, 'DKK', 'da')` -> `150,00 kr.`. */
export function formatPrice(amount: number, currency: string, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100)
}

/** Normalises a stored requirement: empty plan lists mean "any active subscription". */
export function normalizeMembership(value: MembershipRequirement | undefined): MembershipRequirement {
  if (value === 'any') return 'any'
  if (Array.isArray(value)) return value.length ? value : 'any'
  return null
}

/** Resolves a relative path against `origin`, and only accepts absolute URLs on the same origin. */
export function resolveSameOriginUrl(input: string, origin: string): string | null {
  if (input.startsWith('/')) {
    if (input.startsWith('//') || input.startsWith('/\\')) return null
    return `${origin}${input}`
  }
  try {
    return new URL(input).origin === new URL(origin).origin ? input : null
  }
  catch {
    return null
  }
}

/** Random, prefixed id (`tkt_...`), Web Crypto only so it works on Workers. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}

/** A longer random token for ticket QR codes. */
export function newTicketCode(): string {
  return `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
}
