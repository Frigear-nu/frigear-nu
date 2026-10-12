export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { scopes: ['events:read'] })
  return { userId: user.id }
})
