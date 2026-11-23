import { created } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftBroadcastResultDto } from '../../../../types'

// Messages the people of an operation (staff with `shifts:broadcast`): the members of its teams (`audience.teamId`,
// `audience.teamRole` narrow them) or the people on one shift (`audience.shiftId`). Email by default; SMS only when
// `channels` asks for it, because it costs money. Each person gets the text in their own locale. 400 `audience_empty`
// when nobody matches, `audience_too_large` past 500 people.
export default defineEventHandler(async (event): Promise<ShiftBroadcastResultDto> => {
  const principal = await authorize(event, shiftsAccess.permissions.broadcast)
  const input = await readValidatedBody(event, shiftsBroadcastInput.parse)
  const operation = await getOperationOr404(input.operationId)
  await authorize(event, shiftsAccess.permissions.broadcast, { operationId: operation.id })
  return created(event, await shiftsSendBroadcast(event, { ...input, operationId: operation.id }, Number(principal.user.id)))
})
