import mapSessionUser from '#users/session-mapper'

type SafeUser = Record<string, unknown>

/**
 * Strips the password hash from an already-loaded DB user record and passes it through the
 * (possibly user-overridden) session mapper. Called once, at login/registration time, with the
 * user record the caller already fetched or created - the enriched result is stored directly in
 * the session, so we don't need to re-query the database on every subsequent session read.
 */
export function mapUserToSession(dbUser: SafeUser & { password?: string | null }) {
  const { password: _password, ...safeUser } = dbUser

  return mapSessionUser(safeUser)
}
