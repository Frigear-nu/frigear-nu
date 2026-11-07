import { db } from '@nuxthub/db'
import { isAllowlisted } from '#shared/acl'

// Host policy for `@frigear-nu/forms`: who may manage forms and read submissions. Staff roles (the same
// roles that can open the admin area) or a verified email on the NUXT_FORMS_ADMIN_EMAILS allowlist. The role is
// resolved from the database (and NUXT_ACL_ADMINS), not the session, so it never goes stale.
const formsStaff = ['admin', 'manager', 'coordinator']

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:authorize', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    if (!actor) return
    ctx.allowed = isAllowlisted(actor, staffAllowlists().formsAdmins) || formsStaff.includes(effectiveRole(actor))
  })
})
