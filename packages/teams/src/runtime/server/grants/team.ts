import { z } from 'zod'
import { defineGrantKind } from '@frigear-nu/grants/core'
import type { TeamGrant } from '../../../types'
import { ladderKeys, roleAtLeast } from '../../utils/ladders'

// The `team` grant kind of `@frigear-nu/grants`: the users holding `minRole`, or a role above it on the ladder of the
// team's kind, on one team. Explicit and mapped roles both count; a pending or inactive membership does not. The
// ladders are the app's (the module option), so a role off the ladder admits nobody.
export default defineGrantKind<TeamGrant>('team', {
  schema: z.strictObject({
    kind: z.literal('team'),
    teamId: z.string().trim().min(1).max(64),
    minRole: z.string().trim().min(1).max(64),
  }),
  async matches({ event, user, grant }) {
    if (!user) return false
    const held = await teamGrantOf(event, user.id, grant.teamId)
    if (!held) return false
    const ladder = (await loadTeamLadders(event))[held.kind]
    return roleAtLeast(ladderKeys(ladder), held.role, grant.minRole)
  },
  async members({ event, grants }) {
    const ladders = await loadTeamLadders(event)
    const ids = new Set<number>()
    for (const grant of grants) {
      const team = await findTeamById(grant.teamId)
      if (!team) continue
      const keys = ladderKeys(ladders[team.kind])
      for (const member of await teamMembers(event, grant.teamId, { mapped: true })) {
        if (member.source === 'explicit' && !teamMemberStatusGrants(member.status)) continue
        if (roleAtLeast(keys, member.role, grant.minRole)) ids.add(member.userId)
      }
    }
    return ids
  },
  async validate({ event, grant }) {
    const team = await findTeamById(grant.teamId)
    if (!team) return 'This team does not exist.'
    const keys = ladderKeys((await loadTeamLadders(event))[team.kind])
    return keys.includes(grant.minRole) ? undefined : `"${grant.minRole}" is not a role of this team's ladder.`
  },
})
