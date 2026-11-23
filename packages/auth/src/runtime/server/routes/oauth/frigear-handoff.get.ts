import { idParams } from '@frigear-nu/module-kit/server'

// `GET /api/auth/frigear/handoffs/:id`: the status of this window's attempt (`FrigearHandoffDto`), what the window
// polls. 401 without the attempt cookie, 403 when the attempt is not this window's.
export default defineEventHandler(async (event) => {
  requireFrigearHandoffSecret(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const { row } = await requireFrigearHandoff(event, id)
  setResponseHeader(event, 'cache-control', 'no-store')
  return toFrigearHandoffDto(row)
})
