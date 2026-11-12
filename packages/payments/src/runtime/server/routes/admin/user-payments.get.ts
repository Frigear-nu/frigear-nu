import { z } from 'zod'
import type { PaymentDto } from '../../../../types'

const querySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) })

// A user's payments for staff, newest first: needs `payments:manage` (seeing a user is not enough to see what they paid),
// with the user as the target (action `view`, so no target protection), like the staff routes of `@frigear-nu/subscriptions`.
export default defineEventHandler(async (event): Promise<PaymentDto[]> => {
  const { target } = await loadUsersAdminTarget(event, 'view', { permission: 'payments:manage' })
  const { limit } = await getValidatedQuery(event, querySchema.parse)
  return listUserPayments(target.id, { limit })
})
