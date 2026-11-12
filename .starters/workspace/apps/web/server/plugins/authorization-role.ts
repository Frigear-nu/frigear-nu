// Loads the `authorization:role` hook type (Nitro's server tsconfig does not include module types).
import type {} from '@frigear-nu/authorization'

// The role a user acts as (role-based access control, `authorization.rbac`): the stored one, or `admin` for verified
// emails in NUXT_ACL_ADMINS (`effectiveRole`). The roles decide the rest: `admin` may do everything, including the users
// admin; add roles and grants under `authorization.roles` in nuxt.config.ts.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('authorization:role', (ctx) => {
    ctx.role = effectiveRole(ctx.user as Parameters<typeof effectiveRole>[0])
  })
})
