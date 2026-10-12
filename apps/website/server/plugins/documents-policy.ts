import { db } from '@nuxthub/db'

// Host policy for `@frigear-nu/documents`: who may manage documents. The same staff roles that can open the admin area. The role
// is resolved from the database (and NUXT_ACL_ADMINS), not the session, so it never goes stale.
const documentsStaff = ['admin', 'manager', 'coordinator']

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('/Users/kristianhareland/Workspace/frigear-oss/frigear-nu/.claude/worktrees/documents-module-sharing-8688e7/documentsuthorize', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    if (!actor) return
    ctx.allowed = documentsStaff.includes(effectiveRole(actor))
  })
})
