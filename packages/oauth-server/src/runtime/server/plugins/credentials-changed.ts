// A changed password or email ends every OAuth sign-in of the user (`revokeOnCredentialChange`, on by default): whoever
// held the old credentials may have signed an application in with them. `@frigear-nu/auth` fires the hook.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('auth:credentials:changed', async (ctx) => {
    if (useOAuthConfig().revokeOnCredentialChange === false) return
    const userId = Number(ctx.userId)
    if (!Number.isSafeInteger(userId)) return
    await revokeUserGrants(userId, undefined, 'credentials_changed')
  })
})
