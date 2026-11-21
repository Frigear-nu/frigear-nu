// Test-only: calls `ensureMap` with the body, the way an owner module would from a hook.
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return ensureMap(event, body)
})
