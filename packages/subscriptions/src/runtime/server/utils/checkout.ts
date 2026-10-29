import { badRequest } from '@frigear-nu/module-kit/server'
import type { ResolvedPlan } from '../../../types'
import { findPrice } from '../../utils/plans'

type StripeClient = ReturnType<typeof useStripe>

/**
 * Resolves the Stripe price (and configured plan key) a checkout targets from a `planKey` and/or `priceId`,
 * against the given plans. Without configured plans any active recurring price may be used ("any subscription").
 * Throws a 400 for unknown or ambiguous targets.
 */
export async function resolveCheckoutTarget(
  stripe: StripeClient,
  plans: ResolvedPlan[],
  body: { planKey?: string, priceId?: string },
): Promise<{ priceId: string, planKey: string | null }> {
  const configured = Object.keys(useRuntimeConfig().subscriptions?.plans ?? {}).length > 0
  if (!configured) {
    if (!body.priceId) throw badRequest('`priceId` is required when no plans are configured.')
    const price = await stripe.prices.retrieve(body.priceId).catch(() => null)
    if (!price?.recurring || !price.active) throw badRequest('Unknown or non-recurring price.')
    return { priceId: price.id, planKey: null }
  }

  if (body.planKey) {
    const plan = plans.find(item => item.key === body.planKey)
    if (!plan) throw badRequest('Unknown or unavailable plan.')
    const price = body.priceId
      ? plan.prices.find(item => item.id === body.priceId)
      : plan.prices.length === 1 ? plan.prices[0] : undefined
    if (!price) {
      throw badRequest(body.priceId ? 'That price does not belong to the plan.' : 'This plan has several prices; provide `priceId`.')
    }
    return { priceId: price.id, planKey: plan.key }
  }

  const found = findPrice(plans, body.priceId!)
  if (!found) throw badRequest('Unknown or unavailable price.')
  return { priceId: found.price.id, planKey: found.plan.key }
}
