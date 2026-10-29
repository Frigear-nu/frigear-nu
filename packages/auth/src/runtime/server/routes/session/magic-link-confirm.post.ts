import { z } from 'zod'
import { apiError } from '@frigear-nu/module-kit/server'

const invalidLink = () => apiError(400, 'invalid_link', 'This sign-in link is invalid or has expired.')

// `POST /api/auth/magic-link/confirm`. The emailed link opens the `/auth/magic-link` page; only its "Continue" button
// signs in, through this POST. A GET never uses the link up, so mail scanners and link previews that open it leave it
// working.
export default defineEventHandler(async (event) => {
  const { code } = await readValidatedBody(event, z.object({ code: z.string().min(1) }).parse)

  const link = await consumeMagicLink(code)
  if (!link) {
    throw invalidLink()
  }

  const now = new Date()
  // Receiving the link proves control of the address.
  const user = await useAuthUserStore().update(link.userId, { lastLoginAt: now, emailVerifiedAt: now })

  if (!user) {
    throw invalidLink()
  }

  await setUserSession(event, { user: mapUserToSession(user) })

  return { redirect: isInternalPath(link.redirectUrl) ? link.redirectUrl : getAfterLoginPath(event) }
})
