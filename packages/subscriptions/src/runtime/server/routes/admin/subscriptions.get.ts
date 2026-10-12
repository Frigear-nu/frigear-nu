import type { MeResponse } from '../../../../types'

// Every subscription row of a user (active and ended, Stripe and manual grants), newest first. Authorized through the
// users admin policy (`users:admin:authorize`, action `view`) like the rest of the staff membership routes.
export default defineEventHandler(async (event): Promise<MeResponse> => {
  const { target } = await loadAdminMembershipTarget(event, 'view')
  return listUserSubscriptions(target.id)
})
