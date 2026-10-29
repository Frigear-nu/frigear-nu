import { db } from '@nuxthub/db'
import type { AuthPasskeyDto } from '../../../../types'

// `GET /api/auth/me/passkeys` (session only): the caller's passkeys, oldest first.
export default defineEventHandler(async (event): Promise<AuthPasskeyDto[]> => {
  const { user } = await requireAuth(event, { sessionOnly: true })

  const rows = await db.query.userCredentials.findMany({
    where: (t, { eq }) => eq(t.userId, user.id),
    columns: { id: true, name: true, backedUp: true, transports: true, createdAt: true },
    orderBy: (t, { asc }) => asc(t.createdAt),
  })
  return rows.map(toPasskeyDto)
})
