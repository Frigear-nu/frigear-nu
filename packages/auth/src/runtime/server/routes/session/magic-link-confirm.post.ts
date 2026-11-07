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

  const users = useAuthUserStore()
  const before = await users.findById(link.userId)
  if (!before) {
    throw invalidLink()
  }
  // A sign-in link to an account that was never verified: whoever registered it may not own the address, so the
  // password, passkeys and tokens they set go before the owner gets in. The account's own verification link keeps them.
  if (!before.emailVerifiedAt && !isVerificationMagicLinkCode(link.code)) {
    await clearUnverifiedAuthCredentials(before.id, event)
  }

  const now = new Date()
  // Receiving the link proves control of the address.
  const user = await users.update(link.userId, { lastLoginAt: now, emailVerifiedAt: now })

  if (!user) {
    throw invalidLink()
  }

  await replaceUserSession(event, { user: mapUserToSession(user) })

  return { redirect: isInternalPath(link.redirectUrl) ? link.redirectUrl : getAfterLoginPath(event) }
})
