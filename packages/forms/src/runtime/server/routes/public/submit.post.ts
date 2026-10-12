import type { SubmitResponse } from '../../../../types'

export default defineEventHandler(async (event): Promise<SubmitResponse> => {
  const slug = getRouterParam(event, 'slug')!
  await enforceRateLimit(event, slug)
  const form = await findPublishedForm(slug)
  const { userId } = await authorizeFormAccess(event, form)
  return processSubmission(event, form, userId)
})
