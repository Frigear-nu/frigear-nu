import type { PaymentDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<PaymentDto[]> => {
  const user = await requireUser(event, { scopes: ['payments:read'] })
  return listUserPayments(user.id)
})
