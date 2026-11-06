import { idParams, noContent, notFound } from '@frigear-nu/module-kit/server'

// `DELETE /api/oauth-server/me/sessions/:id`: signs the caller out of one application (`:id` is its id), on every device.
export default defineEventHandler(async (event) => {
  const userId = await requireSessionUserId(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  if (!(await revokeUserOAuthApplication(userId, id))) throw notFound('Not signed in to this application.')
  return noContent(event)
})
