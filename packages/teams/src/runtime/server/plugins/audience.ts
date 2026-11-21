import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'

// Teams' answers to the audience contract, always on (audience is a hard dependency):
// - `audience:viewer:resolve`: every team grant of the user (every owner, explicit and mapped) into `viewer.teamRoles`,
//   and the ladder of each kind among them into `viewer.ladders`.
// - `audience:owner:resolve` for the `team` owner type: the team's name, and whether it exists.
export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('audience:viewer:resolve', async (ctx) => {
    // The user comes from `ctx.user`, never from the session: bearer requests have none. The calling module seeds the
    // global roles; when it did not, ask auth (cached per request).
    let grants: Awaited<ReturnType<typeof resolveAllTeamRoles>>
    let ladders: Record<string, string[]>
    try {
      const globalRoles = ctx.viewer.globalRoles.length ? ctx.viewer.globalRoles : await teamsGlobalRolesOf(ctx.event, ctx.user.id)
      grants = await resolveAllTeamRoles(ctx.event, ctx.user.id, { globalRoles })
      ladders = grants.length ? teamLadderKeyMap(await loadTeamLadders(ctx.event)) : {}
    }
    catch (error) {
      // Fail closed: without its team roles the viewer sees less, never more.
      console.error('[teams] the team roles of the viewer could not be resolved; the viewer gets none', error)
      return
    }
    ctx.viewer.teamRoles.push(...grants)
    for (const kind of new Set(grants.map(grant => grant.kind))) {
      if (ladders[kind] && !ctx.viewer.ladders[kind]) ctx.viewer.ladders[kind] = ladders[kind]
    }
  })

  nitro.hooks.hook('audience:owner:resolve', async (ctx) => {
    if (ctx.owner.type !== 'team') return
    if (!ctx.owner.id) {
      ctx.exists = false
      return
    }
    const [row] = await db.select({ name: schema.teams.name }).from(schema.teams).where(eq(schema.teams.id, ctx.owner.id)).limit(1)
    ctx.exists = !!row
    if (row) ctx.label = row.name
  })
})
