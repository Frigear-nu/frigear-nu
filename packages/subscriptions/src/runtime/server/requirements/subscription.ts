import type { AuthRoleRequirementContext } from '@frigear-nu/auth/utils'
import { hasActiveSubscription } from '../utils/subscriptions'

/**
 * The plans a `subscription` requirement value names: `'*'` is any plan (`[]`), a plan key or an array of plan keys
 * those plans. Anything else is invalid (`null`), and the requirement is then not met.
 */
export function subscriptionRequirementPlans(value: unknown): string[] | null {
  if (value === '*') return []
  if (typeof value === 'string' && value) return [value]
  if (Array.isArray(value) && value.length && value.every(plan => typeof plan === 'string' && plan)) return [...value] as string[]
  return null
}

/**
 * The `subscription` role requirement (`requirements: { subscription: '*' | 'member' | ['member', 'patron'] }`): met
 * while the user holds an entitled subscription (`active` / `trialing`, not ended; free grants count) on one of the
 * plans, any plan for `'*'`.
 */
export default async function subscriptionRequirement({ user, value }: AuthRoleRequirementContext): Promise<boolean> {
  const plans = subscriptionRequirementPlans(value)
  const userId = Number(user.id)
  if (!plans || !Number.isInteger(userId)) return false
  return hasActiveSubscription(userId, { plans })
}
