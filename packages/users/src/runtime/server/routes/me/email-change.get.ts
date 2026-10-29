import { z } from 'zod'
import { notFound } from '@frigear-nu/module-kit/server'
import { EMAIL_CHANGE_INVALID, findEmailChangeByCode, maskEmail } from '../../email-change'

// Read-only preview for the `/auth/verify-email-change` page: what the link would change and whether the caller may
// confirm it. Never uses the code up (mail scanners and link previews open the link).
export default defineEventHandler(async (event) => {
  const { code } = await getValidatedQuery(event, z.object({ code: z.string().min(1) }).parse)
  setResponseHeader(event, 'cache-control', 'no-store')

  const change = await findEmailChangeByCode(code)
  if (!change) {
    throw notFound(EMAIL_CHANGE_INVALID)
  }

  const user = await getUser(event)
  const owner = user?.id === change.userId
  const status = change.verifiedAt ? 'confirmed' : change.expiresAt <= new Date() ? 'expired' : 'pending'

  return {
    status,
    signedIn: !!user,
    owner,
    // The code was emailed to the new address, so its holder knows it; the old one is only shown to its owner.
    newEmail: change.newEmail,
    oldEmail: owner ? change.oldEmail : maskEmail(change.oldEmail),
  }
})
