export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { scopes: ['events:read'] })
  return { userId: user.id }
})
