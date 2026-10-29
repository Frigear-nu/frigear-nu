import { isoDate } from '@frigear-nu/module-kit/server'
import type { AdminMembershipResponse as MembershipResponse } from '../../../../types'

// The user's current membership and the plans staff may grant.
export default defineEventHandler(async (event): Promise<MembershipResponse> => {
  const { target } = await loadUsersAdminTarget(event, 'view')
  const current = currentEntitledRow(await listUserSubscriptionRows(target.id))

  const plans = useRuntimeConfig().subscriptions?.plans ?? {}
  return {
    plans: Object.entries(plans)
      .map(([key, plan]) => ({ key, label: plan.label ?? key, rank: plan.rank }))
      .sort((a, b) => a.rank - b.rank),
    current: current
      ? {
          id: current.id,
          planKey: current.planKey,
          status: current.status,
          source: current.source === 'manual' ? 'manual' : 'stripe',
          currentPeriodEnd: isoDate(current.currentPeriodEnd),
          cancelAtPeriodEnd: current.cancelAtPeriodEnd,
        }
      : null,
  }
})
