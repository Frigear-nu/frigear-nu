import { z } from 'zod'

// The emailed link opens the `/auth/magic-link` page; only its "Continue" button signs in, through this POST. A GET
// never uses the link up, so mail scanners and link previews that open it leave it working.
export default defineEventHandler(async (event) => {
  const { code } = await readValidatedBody(event, z.object({ code: z.string().min(1) }).parse)

  const link = await consumeMagicLink(code)
  if (!link) {
    throw createError({ statusCode: 400, statusMessage: 'This sign-in link is invalid or has expired.' })
  }

  const now = new Date()
  // Receiving the link proves control of the address.
  const user = await useAuthUserStore().update(link.userId, { lastLoginAt: now, emailVerifiedAt: now })

  if (!user) {
    throw createError({ statusCode: 400, statusMessage: 'This sign-in link is invalid or has expired.' })
  }

  await setUserSession(event, { user: mapUserToSession(user) })

  return { redirect: isInternalPath(link.redirectUrl) ? link.redirectUrl : getAfterLoginPath(event) }
})
