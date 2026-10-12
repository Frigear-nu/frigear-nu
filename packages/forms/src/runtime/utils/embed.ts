import type { FormAccessInfoDto } from '../../types'

/** What `<FormEmbed>` renders for a form. */
export type EmbedMode = 'form' | 'password' | 'sign-in' | 'hidden' | 'not-found'

/**
 * Picks what an embedded form shows from its access info. API-only forms and token forms have no
 * public UI (a bearer token cannot be typed into a page), so they render nothing; a missing form is `not-found`.
 */
export function embedMode(access: FormAccessInfoDto | null | undefined): EmbedMode {
  if (!access) return 'not-found'
  if (access.access.availability === 'api' || access.access.auth === 'token') return 'hidden'
  if (access.access.auth === 'user' && !access.signedIn) return 'sign-in'
  if (access.access.auth === 'password') return 'password'
  return 'form'
}
