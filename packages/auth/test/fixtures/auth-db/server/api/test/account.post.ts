export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { sessionOnly: true })
  return { userId: user.id }
})
