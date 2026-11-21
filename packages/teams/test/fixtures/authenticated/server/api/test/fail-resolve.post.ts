// Test-only: makes the stand-in `teams:roles:resolve` listener throw for the signed-in caller.
export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  testFailingUsers.add(String(principal.user.id))
  return { ok: true }
})
