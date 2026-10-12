export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  return { userId: user.id }
})
