import type { H3Event } from 'h3'

/** Only same-origin absolute paths are followed after sign in; never `//host`, `/\host` or full URLs. */
export function isInternalPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
}

const REDIRECT_COOKIE = 'auth-redirect'

/** The configured landing path after sign in (`authentication.settings.afterLogin`), `/` by default. */
export function getAfterLoginPath(event?: H3Event) {
  const path = useRuntimeConfig(event).public.authentication?.afterLogin
  return isInternalPath(path) ? path : '/'
}

/** Remembers `?redirect=` across an OAuth/SSO round trip to the identity provider. */
export function rememberLoginRedirect(event: H3Event) {
  const target = getQuery(event).redirect
  if (!isInternalPath(target)) return
  setCookie(event, REDIRECT_COOKIE, target, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/', secure: !import.meta.dev })
}

/** The remembered `?redirect=` (consumed), or the configured landing path. */
export function consumeLoginRedirect(event: H3Event) {
  const target = getCookie(event, REDIRECT_COOKIE)
  if (target) deleteCookie(event, REDIRECT_COOKIE, { path: '/' })
  return isInternalPath(target) ? target : getAfterLoginPath(event)
}
