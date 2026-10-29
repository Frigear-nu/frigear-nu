import { z } from 'zod'
import type { PaymentDto } from '../../../../types'

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) })

// A user's payments for staff, newest first. Authorized through the users admin policy (`users:admin:authorize`,
// action `view`) with the user as the target, like the staff membership routes of `@frigear-nu/subscriptions`.
export default defineEventHandler(async (event): Promise<PaymentDto[]> => {
  const { target } = await loadUsersAdminTarget(event, 'view')
  const { limit } = await getValidatedQuery(event, querySchema.parse)
  return listUserPayments(target.id, { limit })
})
