import { signIdCode } from '../../utils/id-code'
import type { IdCodeRuntimeConfig } from '../../utils/id-code'

// `GET /api/account/id-code` (session only): a 60 second "Frigear ID" code for the signed-in user (501 `not_configured`
// without a signing key).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  return signIdCode(useRuntimeConfig(event) as IdCodeRuntimeConfig, user.id, getRequestURL(event).origin)
})
