import { idParams } from '@frigear-nu/module-kit/server'
import { shiftsAccess } from '../../../access'
import type { ShiftsNowDto } from '../../../../types'

// Who is on shift now in an operation, per team, with the leads on duty (the BA on duty). For people who take part in
// the operation (approved crew, or an explicit team role there) and staff. Names always; email and phone number only
// with `shifts:pii`.
export default defineEventHandler(async (event): Promise<ShiftsNowDto> => {
  await authorize(event, shiftsAccess.permissions.read)
  const { operationId } = await getValidatedRouterParams(event, idParams('operationId').parse)
  const operation = await getOperationOr404(operationId)
  await authorize(event, shiftsAccess.permissions.read, { operationId: operation.id })
  return shiftsNow(event, operation.id, await allows(event, shiftsAccess.permissions.pii))
})
