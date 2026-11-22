// Like the website's NUXT_ACL_ADMINS: an email allowlist that adds the `admin` role, read from `ctx.user`.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('authorization:roles', (ctx) => {
    const email = (ctx.user as { email?: unknown }).email
    if (email === 'allowlisted@example.com' && !ctx.roles.includes('admin')) ctx.roles.push('admin')
  })
})
