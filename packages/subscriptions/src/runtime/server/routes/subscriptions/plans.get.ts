import type { PlansResponse } from '../../../../types'

// Public: lists the configured plans with live Stripe prices (cached), filtered by policy hooks.
export default defineEventHandler(async (event): Promise<PlansResponse> => {
  return { plans: await getAvailablePlans(event) }
})
