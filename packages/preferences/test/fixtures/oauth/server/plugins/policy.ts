// Everyone may manage applications in this fixture; roles are not part of what is being tested.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('oauth:authorize', (ctx) => {
    ctx.allowed = true
  })
})
