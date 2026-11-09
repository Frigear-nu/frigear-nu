// The role a user acts as for role-based access control (`authorization.rbac`): the stored one, except that verified
// addresses in NUXT_ACL_ADMINS are always admins (`effectiveRole`).
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('authorization:role', (ctx) => {
    ctx.role = effectiveRole(ctx.user as Parameters<typeof effectiveRole>[0])
  })
})
