// Test-only: what `teams:owner:resolve` answers for `?type=&id=`, the way a module storing owners (help-center, inbox) asks.
export default defineEventHandler(async (event) => {
  const { type = 'team', id = '' } = getQuery(event) as { type?: string, id?: string }
  return resolveTeamsOwner(event, { type, id: id || null })
})
