import { z } from 'zod'

// Browser navigation (the emailed link): signs the user in, then redirects. A bad link goes back to the login
// page with `?error=magic-link` instead of showing a raw API error.
export default defineEventHandler(async (event) => {
  const { code } = await getValidatedQuery(event, z.object({ code: z.string().min(1) }).parse)
  const loginPath = useRuntimeConfig(event).public.authentication?.pages?.login || '/'

  const link = await consumeMagicLink(code)
  if (!link) {
    return sendRedirect(event, `${loginPath}?error=magic-link`)
  }

  const now = new Date()
  // Receiving the link proves control of the address.
  const user = await useAuthUserStore().update(link.userId, { lastLoginAt: now, emailVerifiedAt: now })

  if (!user) {
    return sendRedirect(event, `${loginPath}?error=magic-link`)
  }

  await setUserSession(event, { user: mapUserToSession(user) })

  return sendRedirect(event, isInternalPath(link.redirectUrl) ? link.redirectUrl : getAfterLoginPath(event))
})
