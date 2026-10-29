import { db } from '@nuxthub/db'

// Test policy: only staff@example.com may administer users and see the dashboard's recent payments.
const isStaff = async (userId: number) => {
  const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, userId) })
  return actor?.email === 'staff@example.com'
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('users:admin:authorize', async (ctx) => {
    ctx.allowed = await isStaff(ctx.userId)
  })
  nitro.hooks.hook('payments:authorize', async (ctx) => {
    ctx.allowed = await isStaff(ctx.userId)
  })
})
