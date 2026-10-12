export default defineEventHandler(async (event) => {
  const user = await getAuthUser(event, { scopes: ['events:read'] })
  return { userId: user?.id ?? null }
})
