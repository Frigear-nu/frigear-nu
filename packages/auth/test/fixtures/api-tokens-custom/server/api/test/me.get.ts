export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event)
  return { kind: principal.kind, user: principal.user, scopes: principal.scopes }
})
