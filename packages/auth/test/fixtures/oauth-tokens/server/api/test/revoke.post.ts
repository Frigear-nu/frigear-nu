export default defineEventHandler(async (event) => {
  const { provider } = await readBody<{ provider: string }>(event)
  await revokeOAuthTokens(1, provider)
  return { ok: true }
})
