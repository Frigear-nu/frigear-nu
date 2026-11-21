import { db, schema } from '@nuxthub/db'
import { created, idParams, validationError } from '@frigear-nu/module-kit/server'
import { crewAccess } from '../../../access'
import { newId } from '../../../utils'
import type { CreatedCrewInviteDto } from '../../../../types'

// Creates an invite link for a team of the operation and a role of its ladder (`ba` for "invite as lead"). The token is in
// this response only; the database keeps its hash. It mints a credential that grants a role, so it needs a session: an
// API token is refused with 403 `session_required`.
export default defineEventHandler(async (event): Promise<CreatedCrewInviteDto> => {
  const principal = await authorize(event, crewAccess.permissions.invite)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const input = await readValidatedBody(event, crewInviteInput.parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, crewAccess.permissions.invite, operation)
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) {
    throw validationError([{ path: ['expiresAt'], message: 'The invite must expire in the future.' }], 'Invalid expiry')
  }
  const team = await getCrewOperationTeamOr400(operation.id, input.teamId)
  await assertTeamRoleOnLadder(event, team.kind, input.role)
  const { token, tokenHash, prefix } = await crewGenerateToken()
  const [row] = await db.insert(schema.crewInvites).values({
    id: newId('civ'),
    operationId: operation.id,
    teamId: team.id,
    role: input.role,
    tokenHash,
    prefix,
    maxUses: input.maxUses,
    expiresAt: input.expiresAt ?? null,
    createdBy: Number(principal.user.id),
  }).returning()
  const invitePath = (useRuntimeConfig(event).public.crew as { pages?: { invite?: string } } | undefined)?.pages?.invite
  return created(event, { ...toCrewInviteDto(row!, team.name), token, path: invitePath ? invitePath.replace(':token', encodeURIComponent(token)) : null })
})
