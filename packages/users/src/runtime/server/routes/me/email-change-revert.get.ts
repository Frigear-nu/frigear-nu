import { z } from 'zod'
import { EMAIL_REVERT_INVALID, findEmailChangeByRevertCode } from '../../email-change'

// Read-only preview for the `/auth/revert-email-change` page. Never uses the code up.
export default defineEventHandler(async (event) => {
  const { code } = await getValidatedQuery(event, z.object({ code: z.string().min(1) }).parse)
  setResponseHeader(event, 'cache-control', 'no-store')

  const change = await findEmailChangeByRevertCode(code)
  if (!change?.verifiedAt) {
    throw createError({ statusCode: 404, statusMessage: EMAIL_REVERT_INVALID })
  }

  const status = change.revertedAt
    ? 'reverted'
    : !change.revertExpiresAt || change.revertExpiresAt <= new Date() ? 'expired' : 'pending'

  // The code was emailed to the old address together with the new one, so its holder knows both.
  return { status, oldEmail: change.oldEmail, newEmail: change.newEmail }
})
