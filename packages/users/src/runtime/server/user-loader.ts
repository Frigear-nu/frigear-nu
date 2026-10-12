import { db } from '@nuxthub/db'
import { mapUserToSession } from './utils/session'

// The user loader `@frigear-nu/auth` calls for bearer credentials (user API tokens, OAuth access
// tokens). It reads the database on every request, so role changes apply immediately instead of
// at the user's next login like the session snapshot.
export default async function loadUser(id: string) {
  const numericId = Number(id)
  if (!Number.isSafeInteger(numericId)) return null
  const user = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, numericId) })
  return user ? mapUserToSession(user) as never : null
}
