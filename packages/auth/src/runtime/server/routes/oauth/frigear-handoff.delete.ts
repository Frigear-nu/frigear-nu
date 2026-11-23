import { idParams, noContent } from '@frigear-nu/module-kit/server'

// `DELETE /api/auth/frigear/handoffs/:id`: cancels this window's attempt (204); a browser that comes back later finds
// nothing to complete.
export default defineEventHandler(async (event) => {
  assertAuthSameOrigin(event)
  const secret = requireFrigearHandoffSecret(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  await requireFrigearHandoff(event, id)
  await removeFrigearHandoff(id, secret)
  clearFrigearHandoffCookie(event)
  return noContent(event)
})
