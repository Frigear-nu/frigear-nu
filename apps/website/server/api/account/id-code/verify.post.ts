import { z } from 'zod'
import { verifyIdCode } from '../../../utils/id-code'
import type { IdCodeRuntimeConfig } from '../../../utils/id-code'
import { toFrigearIdVerification } from '../../../utils/frigear-id'

const verifyBody = z.object({ code: z.string().trim().min(1).max(4096) })

// `POST /api/account/id-code/verify` with `{ code }` (`frigear-id:verify`: crew and up): who a scanned Frigear ID
// belongs to (`FrigearIdVerification`). The code is `urn:frigear:id:<jwt>` or the bare JWT. 400 `invalid_code` when it
// is malformed or not signed by this site, 410 `expired` past its 60 seconds, 404 when the account no longer exists.
export default defineEventHandler(async (event) => {
  await authorize(event, 'frigear-id:verify')
  const { code } = await readValidatedBody(event, verifyBody.parse)
  const verified = await verifyIdCode(useRuntimeConfig(event) as IdCodeRuntimeConfig, code, getRequestURL(event).origin)
  return toFrigearIdVerification(event, verified.userId)
})
