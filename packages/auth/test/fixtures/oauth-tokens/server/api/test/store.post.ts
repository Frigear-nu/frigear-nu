// Stores a token response for user 1 as a login with `keepTokens` would.
export default defineEventHandler(async (event) => {
  const { provider, response, scopes } = await readBody<{ provider: string, response: Record<string, unknown>, scopes?: string[] }>(event)
  await storeOAuthTokens(1, provider, parseOAuthTokenResponse(response, scopes))
  return { ok: true }
})
