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
    const globalRoles = ctx.viewer.globalRoles.length ? ctx.viewer.globalRoles : await teamsGlobalRolesOf(ctx.event, ctx.user.id)
    const grants = await resolveAllTeamRoles(ctx.event, ctx.user.id, { globalRoles })
    ctx.viewer.teamRoles.push(...grants)
    if (!grants.length) return
    const ladders = teamLadderKeyMap(await loadTeamLadders(ctx.event))
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
