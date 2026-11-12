// Test roles by email (an allowlist, as a host would map one): staff are admins, the coordinator holds `users:*` only.
const ROLES: Record<string, string[]> = {
  'staff@example.com': ['admin'],
  'coordinator@example.com': ['coordinator'],
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('authorization:roles', (ctx) => {
    ctx.roles.push(...ROLES[String(ctx.user.email).toLowerCase()] ?? [])
  })
})
