import { db } from '@nuxthub/db'

import mapSessionUser from '#users/session-mapper'

type SafeUser = Record<string, unknown>

/**
 * Loads the full user record from the database and passes it through the
 * (possibly user-overridden) session mapper, stripping the password hash.
 */
export async function enrichSessionUser(userId: number | string) {
  const dbUser = await db.query.users.findFirst({
    where: (t, { eq }) => eq(t.id, userId),
  })

  if (!dbUser) return null

  const { password: _password, ...safeUser } = dbUser as SafeUser & { password?: string | null }

  return mapSessionUser(safeUser)
}
