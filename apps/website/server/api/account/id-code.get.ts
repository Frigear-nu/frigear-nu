import { signIdCode } from '../../utils/id-code'
import type { IdCodeRuntimeConfig } from '../../utils/id-code'

// `GET /api/account/id-code` (a session, or a token with `frigear-id:read`): a 60 second "Frigear ID" code for the
// signed-in user (501 `not_configured` without a signing key). `frigear-id:read` is implicit: every signed-in user holds
// it, and the code is only ever the caller's own.
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'frigear-id:read')
  return signIdCode(useRuntimeConfig(event) as IdCodeRuntimeConfig, user.id, getRequestURL(event).origin)
})
