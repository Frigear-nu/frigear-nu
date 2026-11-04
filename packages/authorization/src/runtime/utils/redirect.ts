import { isSafeRedirect } from '@frigear-nu/auth/mode'

/**
 * Where a guest goes from a page that requires sign in: `redirectTo` with `?redirect=<the page>`, so the sign-in page
 * can send them back (`useAfterLogin` of `@frigear-nu/auth`). Only same-site paths are passed along; an absolute
 * `redirectTo` URL is returned as configured.
 */
export function loginRedirect(redirectTo: string, fullPath: string): string | { path: string, query: { redirect: string } } {
  if (!isSafeRedirect(redirectTo) || !isSafeRedirect(fullPath)) return redirectTo
  // Already on the sign-in page: no `?redirect=` pointing back to itself.
  if (fullPath.split(/[?#]/)[0] === redirectTo) return redirectTo
  return { path: redirectTo, query: { redirect: fullPath } }
}
