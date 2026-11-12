export default defineEventHandler(async (event) => {
  const principal = await requireAuth(event, { sessionOnly: true })
  return { userId: principal.user.id }
})
