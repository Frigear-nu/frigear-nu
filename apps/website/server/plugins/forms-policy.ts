import { db } from '@nuxthub/db'
import { isAllowlisted } from '#shared/acl'

// Host condition for `@frigear-nu/forms`: the role decides who manages forms (`forms:manage`, see
// `authorization.roles`); a verified email on the NUXT_FORMS_ADMIN_EMAILS allowlist may too.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('forms:authorize', async (ctx) => {
    if (ctx.allowed) return
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    ctx.allowed = !!actor && isAllowlisted(actor, staffAllowlists().formsAdmins)
  })
})
