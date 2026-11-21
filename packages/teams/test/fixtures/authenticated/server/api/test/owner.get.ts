import { resolveOwner } from '@frigear-nu/audience/server'

// Test-only: what `audience:owner:resolve` answers for `?type=&id=`, the way a consumer such as maps asks.
export default defineEventHandler(async (event) => {
  const { type = 'team', id = '' } = getQuery(event) as { type?: string, id?: string }
  const { label, exists } = await resolveOwner(event, { type, id: id || null }, { hooks: useNitroApp().hooks })
  return { label, exists }
})
