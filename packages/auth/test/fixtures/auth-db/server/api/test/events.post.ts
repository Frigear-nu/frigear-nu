export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { scopes: ['events:write'] })
  return { userId: user.id }
})
