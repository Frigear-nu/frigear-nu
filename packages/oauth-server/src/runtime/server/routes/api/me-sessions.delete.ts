import { noContent } from '@frigear-nu/module-kit/server'

// `DELETE /api/oauth-server/me/sessions`: signs the caller out of every application.
export default defineEventHandler(async (event) => {
  const userId = await requireSessionUserId(event)
  await revokeUserGrants(userId, undefined, 'signed_out')
  return noContent(event)
})
