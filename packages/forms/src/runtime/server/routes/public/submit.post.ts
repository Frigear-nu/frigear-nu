import type { SubmitResponse } from '../../../../types'

export default defineEventHandler(async (event): Promise<SubmitResponse> => {
  const slug = getRouterParam(event, 'slug')!
  await enforceRateLimit(event, slug)
  const form = await findPublishedForm(slug)
  const session = await getUserSession(event)
  return processSubmission(event, form, session.user?.id ?? null)
})
