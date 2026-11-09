import { db } from '@nuxthub/db'
import { allowsStaffAddressChange } from '#shared/users-policy'

// Host condition for the users admin of `@frigear-nu/users`. The role decides the rest (`users:read`, `users:manage`
// and the role ceiling of `@frigear-nu/authorization`); see `shared/users-policy.ts` for what is added here.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('users:admin:authorize', async (ctx) => {
    if (!ctx.allowed || ctx.action === 'view') return
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    if (!actor) {
      ctx.allowed = false
      return
    }
    const { admins, oauthAdmins, formsAdmins } = staffAllowlists()
    ctx.allowed = allowsStaffAddressChange(effectiveRole(actor), {
      input: ctx.input,
      // The address being written counts too: an allowlisted one would turn the account into staff.
      staffEmails: [...admins, ...oauthAdmins, ...formsAdmins],
      // The target's allow-listed admin status counts too, not just the stored role (`target` carries `emailVerifiedAt`).
      target: ctx.target && { role: effectiveRole(ctx.target) },
    })
  })
})
