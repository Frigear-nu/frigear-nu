import { db } from '@nuxthub/db'
// Loads the `users:admin:*` hook types (Nitro's server tsconfig does not include module types).
import type {} from '@frigear-nu/users'

// Host policy for the users admin of `@frigear-nu/users` (denied unless a hook allows it): admins may do everything.
// Identify the caller from `ctx.userId`, never from the session: the session is empty for API token requests.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('users:admin:authorize', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    ctx.allowed = !!actor && effectiveRole(actor) === 'admin'
  })

  // The roles the role select offers.
  nitro.hooks.hook('users:admin:roles', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    ctx.roles = actor && effectiveRole(actor) === 'admin' ? [...userRoles] : []
  })
})
