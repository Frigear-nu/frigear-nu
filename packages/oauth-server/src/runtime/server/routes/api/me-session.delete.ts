import { idParams, noContent, notFound } from '@frigear-nu/module-kit/server'

// `DELETE /api/oauth-server/me/sessions/:id`: signs the caller out of one application sign-in (a refresh-token family).
export default defineEventHandler(async (event) => {
  const userId = await requireSessionUserId(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  if (!(await revokeUserOAuthSession(userId, id))) throw notFound('Sign-in not found.')
  return noContent(event)
})
