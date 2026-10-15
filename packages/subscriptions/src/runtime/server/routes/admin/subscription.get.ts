import type { AdminMembershipResponse as MembershipResponse } from '../../../../types'

export default defineEventHandler(async (event): Promise<MembershipResponse> => {
  const { target } = await loadUsersAdminTarget(event, 'view')
  const current = currentEntitledRow(await listUserSubscriptionRows(target.id))
  const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null)

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
          currentPeriodEnd: iso(current.currentPeriodEnd),
          cancelAtPeriodEnd: current.cancelAtPeriodEnd,
        }
      : null,
  }
})
