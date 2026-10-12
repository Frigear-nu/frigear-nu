import { db } from '@nuxthub/db'
import { assignableUserRoles, canAdministerUsers } from '#shared/users-policy'

// Host policy for the users admin of `@frigear-nu/users`; the rules live in `shared/users-policy.ts`.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('users:admin:authorize', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    if (!actor) return

    ctx.allowed = canAdministerUsers(effectiveRole(actor), ctx.action, {
      input: ctx.input,
      // The target's allow-listed admin status counts too, not just the stored role.
      target: ctx.target && { role: effectiveRole({ email: ctx.target.email, role: ctx.target.role }) },
    })
  })

  // The role select only offers what the acting user may hand out (see `assignableUserRoles`).
  nitro.hooks.hook('users:admin:roles', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    ctx.roles = actor ? assignableUserRoles(effectiveRole(actor)) : []
  })
})
