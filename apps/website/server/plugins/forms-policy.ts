import { db } from '@nuxthub/db'

// Host policy for `@frigear-nu/forms`: who may manage forms and read submissions. Staff roles (the same
// roles that can open the admin area) or an email on the NUXT_FORMS_ADMIN_EMAILS allowlist. The role is
// resolved from the database (and NUXT_ACL_ADMINS), not the session, so it never goes stale.
const formsStaff = ['admin', 'manager', 'coordinator']

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:authorize', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    if (!actor) return
    const allowlist = useRuntimeConfig().formsAdminEmails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean)
    ctx.allowed = allowlist.includes(actor.email.toLowerCase()) || formsStaff.includes(effectiveRole(actor))
  })
})
