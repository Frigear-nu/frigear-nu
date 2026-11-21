import { db, schema } from '@nuxthub/db'
import { and, eq } from 'drizzle-orm'
import { apiError, idParams } from '@frigear-nu/module-kit/server'
import { operationsAccess } from '../../../access'
import { canTransition } from '../../../utils'
import type { AdminOperationDto, OperationStatus } from '../../../../types'

// Moves an operation along `planning -> active -> wrapped_up -> archived` (or `planning -> archived`). Any other move
// is `409 invalid_status_transition`.
export default defineEventHandler(async (event): Promise<AdminOperationDto> => {
  await authorize(event, operationsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const { status: to } = await readValidatedBody(event, operationStatusInput.parse)
  const existing = await getOperationOr404(id)
  await authorize(event, operationsAccess.permissions.manage, existing)

  const from = existing.status as OperationStatus
  const refuse = () => apiError(409, 'invalid_status_transition', `An operation cannot move from ${from} to ${to}.`, { from, to })
  if (!canTransition(from, to)) throw refuse()

  // Conditional on the status we read, so two staff members moving it at once cannot both succeed.
  const [row] = await db.update(schema.operations).set({ status: to })
    .where(and(eq(schema.operations.id, id), eq(schema.operations.status, from))).returning()
  if (!row) throw refuse()

  const operation = toAdminOperationDto(row)
  await useNitroApp().hooks.callHook('operations:status-changed', { event, operation, from, to })
  return operation
})
