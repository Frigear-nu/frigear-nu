import { isAllowlisted } from '#shared/acl'

// Verified addresses in NUXT_ACL_ADMINS hold the `admin` role (`authorization.roles` in nuxt.config.ts). This bootstraps
// the first admin, who verifies through the emailed link and assigns every other role in the admin. Nothing is stored:
// removing an address removes the access. The user comes from `ctx.user`, never from the session on `ctx.event`.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('authorization:roles', (ctx) => {
    if (isAllowlisted(ctx.user, aclAdmins()) && !ctx.roles.includes('admin')) ctx.roles.push('admin')
  })
})
