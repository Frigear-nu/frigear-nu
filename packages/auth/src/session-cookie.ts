/** What Auth reads and writes of `runtimeConfig.session`. */
export interface SessionCookieConfig {
  cookie?: { secure?: boolean, [key: string]: unknown }
  [key: string]: unknown
}

/**
 * Under `nuxt dev` the session cookie is not `Secure`: the dev server runs on plain http, where WebKit (Safari, and the
 * in-app browser of an iOS app signing in at it) drops a `Secure` cookie even on localhost, so nobody stays signed in.
 * Production builds keep h3's default, `Secure`. An app's own `session.cookie.secure` always wins.
 */
export function applyDevSessionCookie(session: SessionCookieConfig, dev: boolean): SessionCookieConfig {
  if (!dev || session.cookie?.secure !== undefined) return session
  session.cookie = { ...session.cookie, secure: false }
  return session
}
