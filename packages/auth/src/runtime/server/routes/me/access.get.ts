import type { AccessDto } from '../../../utils/permissions'

// `GET /api/auth/me/access`: what the caller may do (any credential). 401 when nobody is signed in. The client's
// `useAuthorization()` reads it; `permissions` is every registered permission a check without a record allows.
export default defineEventHandler(async (event): Promise<AccessDto> => {
  await requireAuth(event)
  setResponseHeader(event, 'cache-control', 'private, no-store')
  return (await getAccess(event))!
})
