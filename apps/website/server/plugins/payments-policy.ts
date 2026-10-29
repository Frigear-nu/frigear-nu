import { db } from '@nuxthub/db'
import { canAdministerUsers } from '#shared/users-policy'

// Host policy for `@frigear-nu/payments`: who sees the admin dashboard's recent payments and revenue. It follows the
// users admin policy (anyone who may view users), so the dashboard works for the same people as before.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('payments:authorize', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    ctx.allowed = !!actor && canAdministerUsers(effectiveRole(actor), 'view')
  })
})
