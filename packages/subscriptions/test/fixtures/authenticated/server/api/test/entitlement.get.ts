import * as utils from '../../../../../../src/runtime/utils'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const userId = Number(query.userId)
  const plans = typeof query.plans === 'string' ? query.plans.split(',') : undefined
  const statuses = typeof query.statuses === 'string' ? query.statuses.split(',') : undefined
  const subscription = await utils.getUserSubscription(userId, { statuses })
  return {
    has: await utils.hasActiveSubscription(userId, { plans, statuses }),
    // The auto-imported server util must agree with the one exported from `/utils`.
    autoImported: await hasActiveSubscription(userId, { plans, statuses }),
    subscriptionId: subscription?.id ?? null,
  }
})
