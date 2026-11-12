// Loads the `authorization:roles` hook type (Nitro's server tsconfig does not include module types).
import type {} from '@frigear-nu/auth'

// Verified addresses in NUXT_ACL_ADMINS hold the `admin` role (`authorization.roles` in nuxt.config.ts). This bootstraps
// the first admin, who verifies through the emailed link and assigns every other role in the admin. Nothing is stored:
// removing an address removes the access. The user comes from `ctx.user`, never from the session on `ctx.event`.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('authorization:roles', (ctx) => {
    const admins = String(useRuntimeConfig().aclAdmins).split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
    // The stored user: an unverified address counts for nothing, since anyone can sign up with it.
    const user = ctx.user as { email?: string | null, emailVerifiedAt?: unknown }
    if (user.emailVerifiedAt && user.email && admins.includes(user.email.toLowerCase()) && !ctx.roles.includes('admin')) {
      ctx.roles.push('admin')
    }
  })
})
