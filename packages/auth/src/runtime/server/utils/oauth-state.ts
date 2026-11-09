import type { H3Event } from 'h3'

/** The cookie nuxt-auth-utils keeps the OAuth `state` in between the redirect to the provider and its callback. */
const STATE_COOKIE = 'nuxt-auth-state'

function equalStrings(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

/**
 * Whether an OAuth callback (`?code=`) carries the `state` this browser was sent off with: a non-empty `?state=` that
 * equals the `nuxt-auth-state` cookie. nuxt-auth-utils compares the two itself, but lets a callback through when both
 * are missing, so a callback without them could sign the browser in to someone else's account. Requests without
 * `code` (the start of the flow) always pass.
 */
export function isOAuthCallbackStateValid(event: H3Event): boolean {
  const { code, state } = getQuery(event)
  if (code === undefined) return true
  const cookie = getCookie(event, STATE_COOKIE)
  return typeof state === 'string' && !!state && !!cookie && equalStrings(state, cookie)
}

/**
 * Sends an OAuth callback without a matching `state` back to the login page (`?error=oauth-state`), dropping the
 * state cookie so it cannot be used again.
 */
export function rejectOAuthCallbackState(event: H3Event) {
  deleteCookie(event, STATE_COOKIE, { path: '/' })
  return authLoginErrorRedirect(event, 'oauth-state')
}
