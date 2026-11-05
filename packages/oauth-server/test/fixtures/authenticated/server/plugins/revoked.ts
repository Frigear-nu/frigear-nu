// Records every `oauth:token:revoked` call, for the sessions and credential-change tests (`GET /api/test/revoked`).
export default defineNitroPlugin((nitro) => {
  const revoked: { applicationId: string, userId: number | null, reason: string }[] = []
  nitro.hooks.hook('oauth:token:revoked', (ctx) => {
    revoked.push({ applicationId: ctx.applicationId, userId: ctx.userId, reason: ctx.reason })
  })
  ;(globalThis as Record<string, unknown>).__oauthRevoked = revoked
})
