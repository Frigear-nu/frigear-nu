import type { PaymentDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<PaymentDto[]> => {
  const { user } = await requireUserSession(event)
  return listUserPayments(user.id)
})
