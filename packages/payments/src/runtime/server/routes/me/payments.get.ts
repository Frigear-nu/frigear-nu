import type { PaymentDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<PaymentDto[]> => {
  const { user } = await authorize(event, 'payments:read')
  return listUserPayments(user.id)
})
