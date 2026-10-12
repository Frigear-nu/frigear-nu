export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { sessionOnly: true })
  return (await listUserTokens(String(user.id))).map(toPublicToken)
})
