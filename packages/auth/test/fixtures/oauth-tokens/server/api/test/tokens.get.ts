// The signed-in user's kept tokens (by event), or user 1's (by id, as a task would) with `?user=1`.
export default defineEventHandler(async (event) => {
  const { provider, user, scopes } = getQuery(event) as { provider: string, user?: string, scopes?: string }
  const target = user ? Number(user) : event
  return {
    tokens: await getOAuthTokens(target, provider),
    accessToken: await getOAuthAccessToken(target, provider, { scopes: scopes ? scopes.split(' ') : undefined }),
  }
})
