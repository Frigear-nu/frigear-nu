// Host claims for `@frigear-nu/oauth-server`: tells the applications users sign in to which color mode the
// user prefers, so they do not fall back to their own default (light) after the redirect.
//
// Only added with the `profile` scope and only to the ID token and `userinfo`; access tokens stay bare.
// Omitted while the user has not chosen, so an application keeps its own default.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('oauth:claims', (ctx) => {
    if (ctx.tokenType === 'access_token' || !ctx.scope.includes('profile')) return
    const { colorMode } = ctx.user
    if (typeof colorMode === 'string') ctx.claims.color_mode = colorMode
  })
})
