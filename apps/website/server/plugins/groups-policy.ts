import { db } from '@nuxthub/db'

// Host policy for `@frigear-nu/groups`: who may manage groups. The same staff roles that can open the admin area. The role
// is resolved from the database (and NUXT_ACL_ADMINS), not the session, so it never goes stale.
const groupsStaff = ['admin', 'manager', 'coordinator']

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('/Users/kristianhareland/Workspace/frigear-oss/frigear-nu/.claude/worktrees/documents-module-sharing-8688e7/groupsuthorize', async (ctx) => {
    const actor = await db.query.users.findFirst({ where: (t, { eq }) => eq(t.id, ctx.userId) })
    if (!actor) return
    ctx.allowed = groupsStaff.includes(effectiveRole(actor))
  })
})
