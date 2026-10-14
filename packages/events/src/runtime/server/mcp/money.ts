import { fromCents, toCents } from '@frigear-nu/mcp/utils'
import { DEFAULT_CURRENCY } from '../../utils'

// MCP tools exchange whole currency units (see `MONEY_NOTICE` in `@frigear-nu/mcp/utils`); the database and REST API keep minor units.
// Add-ons have no currency of their own: they are sold in their ticket type's currency.

type Priced = { price?: number | null }
type TypeLike = Priced & { currency?: string | null, addonGroups?: Array<{ addons?: Priced[] }> }

const currencyOf = (type: { currency?: string | null }) => (type.currency ?? DEFAULT_CURRENCY).toUpperCase()

/** Output: a ticket type (DTO or row) with its price and add-on prices in whole units, currency upper-cased. */
export function ticketTypeToMajor<T extends TypeLike>(type: T): T {
  const currency = currencyOf(type)
  return {
    ...type,
    ...(typeof type.price === 'number' ? { price: fromCents(type.price, currency) } : {}),
    ...(type.currency ? { currency } : {}),
    ...(type.addonGroups
      ? {
          addonGroups: type.addonGroups.map(group => ({
            ...group,
            ...(group.addons ? { addons: group.addons.map(addon => typeof addon.price === 'number' ? { ...addon, price: fromCents(addon.price, currency) } : addon) } : {}),
          })),
        }
      : {}),
  }
}

/** Output: an event with `ticketTypes` converted by `ticketTypeToMajor`. */
export function eventToMajor<T extends { ticketTypes: TypeLike[] }>(event: T): T {
  return { ...event, ticketTypes: event.ticketTypes.map(ticketTypeToMajor) }
}

/** Output: a ticket (or attendee) with `amount` (and add-on prices) in whole units of its own currency. */
export function ticketToMajor<T extends { amount: number, currency: string, addons?: Array<Priced & Record<string, unknown>> }>(ticket: T): T {
  const currency = ticket.currency.toUpperCase()
  return {
    ...ticket,
    currency,
    amount: fromCents(ticket.amount, currency),
    ...(Array.isArray(ticket.addons) ? { addons: ticket.addons.map(addon => typeof addon.price === 'number' ? { ...addon, price: fromCents(addon.price, currency) } : addon) } : {}),
  }
}

/** Input: a ticket type payload (agent, whole units) to minor units, using `fallbackCurrency` when it names none. */
export function ticketTypeToMinor<T extends TypeLike>(type: T, fallbackCurrency = DEFAULT_CURRENCY): T {
  const currency = (type.currency ?? fallbackCurrency).toUpperCase()
  return {
    ...type,
    ...(typeof type.price === 'number' ? { price: toCents(type.price, currency) } : {}),
    ...(type.addonGroups
      ? {
          addonGroups: type.addonGroups.map(group => ({
            ...group,
            ...(group.addons ? { addons: group.addons.map(addon => typeof addon.price === 'number' ? { ...addon, price: toCents(addon.price, currency) } : addon) } : {}),
          })),
        }
      : {}),
  }
}
