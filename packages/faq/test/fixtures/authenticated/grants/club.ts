import { z } from 'zod'
import { defineGrantKind } from '@frigear-nu/auth/grants'
import { testClubMembers, testClubsOf } from '../server/utils/test-state'

// A grant kind the app adds, the way teams adds `team` and operations adds `operation`: the members of a club. Users join
// through `POST /api/test/club`. `club_unknown` does not exist, so storing a grant for it is refused.
export default defineGrantKind<{ kind: 'club', clubId: string }>('club', {
  schema: z.strictObject({ kind: z.literal('club'), clubId: z.string().min(1) }),
  matches: ({ user, grant }) => !!user && testClubsOf(user.id).includes(grant.clubId),
  members: ({ grants }) => testClubMembers(grants.map(grant => grant.clubId)),
  validate: ({ grant }) => grant.clubId === 'club_unknown' ? 'This club does not exist.' : undefined,
})
