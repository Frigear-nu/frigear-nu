// Replaces the client secret (the old one stops working at once) and returns the new one once.
export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const { secret } = await rotateApplicationSecret(getRouterParam(event, 'id') ?? '')
  return { clientSecret: secret }
})
