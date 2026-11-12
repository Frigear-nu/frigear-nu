// The deprecated scope check (`requireAuth(event, { scopes })`) on a permission only admins hold.
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { scopes: ['events:admin'] })
  return { userId: user.id }
})
