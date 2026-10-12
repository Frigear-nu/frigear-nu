import { db } from '@nuxthub/db'

// Test policy: only staff@example.com may administer users.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('users:admin:authorize', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    ctx.allowed = actor?.email === 'staff@example.com'
  })

  nitro.hooks.hook('users:admin:roles', (ctx) => {
    ctx.roles = ['manager', 'user']
  })
})
