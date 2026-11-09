import { noContent } from '@frigear-nu/module-kit/server'

// `POST /api/auth/logout`: clears the session. 204; the client navigates afterwards. Never a GET, so a link
// preview or a prefetch cannot sign anyone out.
export default defineEventHandler(async (event) => {
  assertAuthSameOrigin(event)
  await clearUserSession(event)
  return noContent(event)
})
