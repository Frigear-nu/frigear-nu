import type { H3Event } from 'h3'
import mapSessionUser from '#auth/session-mapper'

type SafeUser = Record<string, unknown>

/**
 * Strips the password hash (and the internal `sessionVersion`) from an already-loaded stored user and passes it through
 * the (possibly host-overridden) session mapper. Used at sign-in for the session's user, and by `getAuth` on every
 * request for the fresh one.
 */
export function mapUserToSession(dbUser: SafeUser & { password?: string | null }) {
  const { password: _password, sessionVersion: _sessionVersion, ...safeUser } = dbUser

  return mapSessionUser(safeUser)
}

/** The user's `sessionVersion` (`users` column added by this module); `0` for a store without it. */
export const authSessionVersionOf = (user: SafeUser | null | undefined) =>
  typeof user?.sessionVersion === 'number' ? user.sessionVersion : 0

/**
 * Signs `user` (a stored user) in: a new session, replacing whatever the browser had, stamped with the user's current
 * `sessionVersion` so `getAuth` can tell it apart from sessions ended since (`endAuthSessions`). The version is read
 * from the store, as the row passed in may predate a credential change made in the same request. `extra` adds other
 * session fields.
 */
export async function startAuthSession(event: H3Event, user: SafeUser & { id: number }, extra: Record<string, unknown> = {}) {
  const current = await useAuthUserStore().findById(user.id)
  await replaceUserSession(event, { ...extra, user: mapUserToSession(user), sessionVersion: authSessionVersionOf(current ?? user) })
}

/**
 * Ends every cookie session of the user: bumps their `sessionVersion`, so `getAuth` refuses sessions stamped earlier.
 * The session of `event`, when it is this user's, is stamped again and stays signed in (the user making a change keeps
 * their own session). Does nothing with a user store that has no `sessionVersion` column. Called for every
 * `auth:credentials:changed`; call it yourself for a "sign out everywhere".
 */
export async function endAuthSessions(userId: number | string, event?: H3Event) {
  const store = useAuthUserStore()
  const stored = await store.findById(userId)
  if (typeof stored?.sessionVersion !== 'number') return
  const next = stored.sessionVersion + 1
  await store.update(stored.id, { sessionVersion: next })
  if (!event) return
  // Only a session that was still valid carries over.
  const session = await getUserSession(event)
  if (session.user && String(session.user.id) === String(stored.id) && authSessionVersionOf(session) === stored.sessionVersion) {
    await setUserSession(event, { sessionVersion: next })
  }
}
