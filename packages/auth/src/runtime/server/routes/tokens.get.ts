export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { sessionOnly: true })
  return (await listUserTokens(String(user.id))).map(toPublicToken)
})
