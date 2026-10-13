import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import store from '#auth/user-store'
import type { AuthUser } from '../../types'

/** The store the sign-in flows read and write users through (provided by `@frigear-nu/users`). */
export function useAuthUserStore() {
  return store
}

/** A user by id as the session sees them, or `null`. Used for bearer credentials, which name the user by id. */
export async function loadAuthUser(id: string | number): Promise<AuthUser | null> {
  const user = await store.findById(id)
  return user ? mapUserToSession(user) as AuthUser : null
}

/** Removes everything this module keeps for a user. Call it when the user is deleted: these tables have no foreign key. */
export async function deleteUserAuthData(userId: number) {
  await db.delete(schema.authUserTokens).where(eq(schema.authUserTokens.userId, String(userId)))
  // Each of these tables only exists when the feature owning it is enabled.
  if (schema.userCredentials) await db.delete(schema.userCredentials).where(eq(schema.userCredentials.userId, userId))
  if (schema.passwordResets) await db.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, userId))
  if (schema.magicLinks) await db.delete(schema.magicLinks).where(eq(schema.magicLinks.userId, userId))
}
