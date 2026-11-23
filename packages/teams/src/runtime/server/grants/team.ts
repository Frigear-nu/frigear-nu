import { db, schema } from '@nuxthub/db'
import { inArray } from 'drizzle-orm'
import { defineGrantKind } from '@frigear-nu/auth/grants'
import { inChunks } from '@frigear-nu/module-kit/server'
import type { TeamGrant } from '../../../types'
import { isTeamKindGrant, teamGrantSchema } from '../../utils/grants'
import { ladderKeys, roleAtLeast } from '../../utils/ladders'

// The `team` grant kind of `@frigear-nu/auth`: the users holding `minRole`, or a role above it on the ladder of the
// team's kind, on one team (`teamId`) or on any team of a kind (`teamKind`). Explicit and mapped roles both count; a
// pending or inactive membership does not. The ladders are the app's (the module option), so a role off the ladder
// admits nobody.
export default defineGrantKind<TeamGrant>('team', {
  schema: teamGrantSchema,
  async matches({ event, user, grant }) {
    if (!user) return false
    const ladders = await loadTeamLadders(event)
    if (isTeamKindGrant(grant)) {
      const keys = ladderKeys(ladders[grant.teamKind])
      return (await resolveAllTeamRoles(event, user.id))
        .some(held => held.kind === grant.teamKind && roleAtLeast(keys, held.role, grant.minRole))
    }
    const held = await teamGrantOf(event, user.id, grant.teamId)
    if (!held) return false
    return roleAtLeast(ladderKeys(ladders[held.kind]), held.role, grant.minRole)
  },
  async members({ event, grants }) {
    const ladders = await loadTeamLadders(event)
    // Every team the grants cover, with the lowest roles that admit on it: one team per `teamId` grant, every team of
    // the kind per `teamKind` grant (one query per chunk of kinds).
    const minRoles = new Map<string, { kind: string, roles: Set<string> }>()
    const cover = (team: { id: string, kind: string }, minRole: string) => {
      const entry = minRoles.get(team.id) ?? { kind: team.kind, roles: new Set<string>() }
      entry.roles.add(minRole)
      minRoles.set(team.id, entry)
    }
    for (const grant of grants) {
      if (isTeamKindGrant(grant)) continue
      const team = await findTeamById(grant.teamId)
      if (team) cover(team, grant.minRole)
    }
    const kindGrants = grants.filter(isTeamKindGrant)
    const kinds = [...new Set(kindGrants.map(grant => grant.teamKind))]
    const teamsOfKinds = await inChunks(kinds, chunk => db.select({ id: schema.teams.id, kind: schema.teams.kind })
      .from(schema.teams).where(inArray(schema.teams.kind, chunk)))
    for (const team of teamsOfKinds) {
      for (const grant of kindGrants) if (grant.teamKind === team.kind) cover(team, grant.minRole)
    }

    const ids = new Set<number>()
    for (const [teamId, { kind, roles }] of minRoles) {
      const keys = ladderKeys(ladders[kind])
      for (const member of await teamMembers(event, teamId, { mapped: true })) {
        if (member.source === 'explicit' && !teamMemberStatusGrants(member.status)) continue
        if ([...roles].some(minRole => roleAtLeast(keys, member.role, minRole))) ids.add(member.userId)
      }
    }
    return ids
  },
  async validate({ event, grant }) {
    const ladders = await loadTeamLadders(event)
    if (isTeamKindGrant(grant)) {
      const ladder = ladders[grant.teamKind]
      if (!ladder) return `"${grant.teamKind}" is not a team kind.`
      return ladderKeys(ladder).includes(grant.minRole) ? undefined : `"${grant.minRole}" is not a role of this kind's ladder.`
    }
    const team = await findTeamById(grant.teamId)
    if (!team) return 'This team does not exist.'
    const keys = ladderKeys(ladders[team.kind])
    return keys.includes(grant.minRole) ? undefined : `"${grant.minRole}" is not a role of this team's ladder.`
  },
})
