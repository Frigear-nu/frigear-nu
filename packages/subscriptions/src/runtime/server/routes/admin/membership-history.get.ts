import type { MeResponse } from '../../../../types'

// Every subscription row of a user (active and ended, Stripe and manual grants), newest first. `users:read`, like the
// rest of the admin user page.
export default defineEventHandler(async (event): Promise<MeResponse> => {
  const { target } = await loadUsersAdminTarget(event, 'view')
  return listUserSubscriptions(target.id)
})
