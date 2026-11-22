import { z } from 'zod'
import { defineGrantKind } from '@frigear-nu/auth/grants'
import type { OperationGrant } from '../../../types'

// The `operation` grant kind of `@frigear-nu/auth`: the users who take part in the operation. Operations stores no
// participants: `operations:participation:resolve` and `operations:participants:resolve` listeners (crew) answer.
export default defineGrantKind<OperationGrant>('operation', {
  schema: z.strictObject({ kind: z.literal('operation'), operationId: z.string().trim().min(1).max(64) }),
  matches: ({ event, user, grant }) => !!user && operationsTakesPart(event, user.id, grant.operationId),
  members: ({ event, grants }) => operationsParticipants(event, grants.map(grant => grant.operationId)),
  async validate({ grant }) {
    return (await findOperationById(grant.operationId)) ? undefined : 'This operation does not exist.'
  },
})
