// A new account (`auth:user:created`, from `@frigear-nu/auth`) joins the lists that add new accounts automatically, and
// the lists the registration form offered that the person ticked (`extras.campaigns.listIds`). A failure is logged and
// never stops the sign-up.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('auth:user:created', async (ctx) => {
    try {
      await campaignsAddNewAccount(ctx.event, ctx.user, ctx.extras?.campaigns)
    }
    catch (error) {
      console.error(`[campaigns] Could not add the new account ${ctx.user.id} to its lists.`, error)
    }
  })
})
