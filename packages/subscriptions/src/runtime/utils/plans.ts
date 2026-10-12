// Pure helpers (no Nuxt / Nitro / DB access) so they are trivially unit-testable.
import type { PlanPriceRef, ResolvedPlan } from '../../types'

export const DEFAULT_ENTITLED_STATUSES = ['active', 'trialing']
/** Statuses that count as "holds a live subscription" when deciding between a new checkout and a plan change. */
/**
 * Whether a stored row currently entitles its user: an entitled status, not ended, and (for manual grants,
 * which have no Stripe lifecycle to end them) not past its optional end date.
 */
export function isEntitledRow(
  row: { status: string, endedAt: Date | null, source?: string | null, currentPeriodEnd: Date | null },
  statuses: string[] = DEFAULT_ENTITLED_STATUSES,
  now = Date.now(),
) {
  if (!statuses.includes(row.status) || row.endedAt) return false
  if (row.source === 'manual' && row.currentPeriodEnd && row.currentPeriodEnd.getTime() <= now) return false
  return true
}

export const LIVE_STATUSES = ['active', 'trialing', 'past_due']

type PlanConfigLike = Record<string, { prices: PlanPriceRef[], rank: number }>

/** Maps a Stripe price (id and/or lookup key) to the configured plan key that lists it, or `null`. */
export function resolvePlanKey(plans: PlanConfigLike, price: { id: string, lookupKey?: string | null }): string | null {
  for (const [key, plan] of Object.entries(plans)) {
    const match = plan.prices.some(ref =>
      typeof ref === 'string' ? ref === price.id : (!!price.lookupKey && ref.lookupKey === price.lookupKey),
    )
    if (match) return key
  }
  return null
}

export type ChangeKind = 'upgrade' | 'downgrade'

/**
 * Decides how to move a subscriber between plans from the plans' `rank` (never from price amounts).
 * A higher target rank is an upgrade (immediate, prorated); a lower or equal rank (including a
 * billing-interval change within one plan) is deferred to the end of the current period. A current
 * plan that isn't configured counts as the lowest rank.
 */
export function decideChangeKind(currentRank: number | null | undefined, targetRank: number): ChangeKind {
  if (currentRank === null || currentRank === undefined) return 'upgrade'
  return targetRank > currentRank ? 'upgrade' : 'downgrade'
}

/**
 * Validates a redirect URL supplied by a client: it must be a relative path (`/x`) or an absolute URL on
 * `origin`. Returns an absolute URL on that origin, or `null` when it is unsafe.
 */
export function resolveSameOriginUrl(input: string, origin: string): string | null {
  if (input.startsWith('/')) {
    // `//host` and `/\host` are protocol-relative / browser-normalised to another host.
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

/** Finds a price (and its plan) in already resolved plans by price id. */
export function findPrice(plans: ResolvedPlan[], priceId: string) {
  for (const plan of plans) {
    const price = plan.prices.find(item => item.id === priceId)
    if (price) return { plan, price }
  }
  return null
}
