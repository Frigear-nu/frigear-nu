import type { H3Event } from 'h3'
import { apiError } from '@frigear-nu/module-kit/server'
import type { UserSession, UserSessionRequired } from '#auth-utils'

// Resource mode (`authentication.mode: 'resource'`) has no cookie sessions and no nuxt-auth-utils: these stand in for
// its session utils, auto-imported under the same names, so server code written for server mode (a route that refreshes
// the session's user, `requireUserSession`) either works without a session or fails with a clear message instead of a
// `ReferenceError`. Every request is authenticated by a bearer resolver (`getAuth`).

const NO_SESSIONS = '[@frigear-nu/auth] `authentication.mode: \'resource\'` has no cookie sessions: people sign in at the issuer and call this server with its access token. Use `getAuth` / `authorize` instead of the session.'

/** There is never a session: an empty one, as nuxt-auth-utils answers for a visitor without a cookie. */
export async function getUserSession(_event: H3Event): Promise<UserSession> {
  return {} as UserSession
}

/** Nothing to clear. */
export async function clearUserSession(_event: H3Event): Promise<boolean> {
  return true
}

/** Throws: a session cannot be started or changed. */
export async function setUserSession(_event: H3Event, _data: Omit<UserSession, 'id'>): Promise<UserSession> {
  throw new Error(NO_SESSIONS)
}

/** Throws: a session cannot be started or changed. */
export async function replaceUserSession(_event: H3Event, _data: Omit<UserSession, 'id'>): Promise<UserSession> {
  throw new Error(NO_SESSIONS)
}

/** Always 401, as for a visitor without a session cookie. */
export async function requireUserSession(_event: H3Event, _options?: { statusCode?: number, message?: string }): Promise<UserSessionRequired> {
  throw apiError(401, 'unauthorized', 'Unauthorized')
}
