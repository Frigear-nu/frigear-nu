import type { PaymentDto } from '../../../../types'

// A user's payments for staff, newest first. Authorized through the users admin policy (`users:admin:authorize`,
// action `view`) with the user as the target, like the staff membership routes of `@frigear-nu/subscriptions`.
export default defineEventHandler(async (event): Promise<PaymentDto[]> => {
  const { target } = await loadUsersAdminTarget(event, 'view')

  const limit = Number(getQuery(event).limit)
  return listUserPayments(target.id, { limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100 })
})
