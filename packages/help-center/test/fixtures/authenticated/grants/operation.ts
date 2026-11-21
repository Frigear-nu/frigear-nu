import { z } from 'zod'
import { defineGrantKind } from '@frigear-nu/grants/core'
import { testParticipantsOf, testTakesPart } from '../server/utils/test-state'

// Stands in for the `operation` grant kind of `@frigear-nu/operations`, with crew answering who takes part: users take
// part through `POST /api/test/participate`. `opr_unknown` does not exist, so storing a grant for it is refused.
export default defineGrantKind<{ kind: 'operation', operationId: string }>('operation', {
  schema: z.strictObject({ kind: z.literal('operation'), operationId: z.string().min(1) }),
  matches: ({ user, grant }) => !!user && testTakesPart(grant.operationId, user.id),
  members: ({ grants }) => testParticipantsOf(grants.map(grant => grant.operationId)),
  validate: ({ grant }) => grant.operationId === 'opr_unknown' ? 'This operation does not exist.' : undefined,
})
