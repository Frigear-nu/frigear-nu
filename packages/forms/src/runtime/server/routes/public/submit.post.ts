import type { SubmitResponse } from '../../../../types'
import { slugParams } from '../../utils/admin-schemas'

// The answers are validated against the form's definition; failures answer 400 with the zod issues in `data.issues`.
export default defineEventHandler(async (event): Promise<SubmitResponse> => {
  const { slug } = await getValidatedRouterParams(event, slugParams.parse)
  await enforceRateLimit(event, slug)
  const form = await findPublishedForm(slug)
  const { userId } = await authorizeFormAccess(event, form)
  return processSubmission(event, form, userId)
})
