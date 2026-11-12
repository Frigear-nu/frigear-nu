// Test roles by email (an allowlist, as a host would map one): staff are admins, the coordinator holds `users:*` only.
const ROLES: Record<string, string[]> = {
  'staff@example.com': ['admin'],
  'coordinator@example.com': ['coordinator'],
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('authorization:roles', (ctx) => {
    const email = String(ctx.user.email).toLowerCase()
    // A user whose roles cannot be resolved (a broken role source): target protection must fail closed on them.
    if (email.startsWith('broken-roles')) throw new Error('role source unavailable')
    ctx.roles.push(...ROLES[email] ?? [])
  })
})
