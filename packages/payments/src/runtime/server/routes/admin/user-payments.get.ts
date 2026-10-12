import { db } from '@nuxthub/db'
import type { PaymentDto } from '../../../../types'

// A user's payments for staff, newest first. Authorized through the users admin policy (`users:admin:authorize`,
// action `view`) with the user as the target, like the staff membership routes of `@frigear-nu/subscriptions`.
export default defineEventHandler(async (event): Promise<PaymentDto[]> => {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id)) throw createError({ statusCode: 400, statusMessage: 'Invalid user id.' })

  const target = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, id) })
  await authorizeUsersAdmin(
    event,
    'view',
    target ? { target: { id: target.id, email: target.email, role: (target as { role?: string }).role }, input: {} } : {},
  )
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found.' })

  const limit = Number(getQuery(event).limit)
  return listUserPayments(target.id, { limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 100 })
})
