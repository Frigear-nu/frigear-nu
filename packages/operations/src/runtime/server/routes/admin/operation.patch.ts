import { idParams } from '@frigear-nu/module-kit/server'
import { operationsAccess } from '../../../access'
import type { AdminOperationDto } from '../../../../types'

// Edits any of the fields except the status (`POST .../status`).
export default defineEventHandler(async (event): Promise<AdminOperationDto> => {
  await authorize(event, operationsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, operationPatchSchema.parse)
  const existing = await getOperationOr404(id)
  // Record-level policies of `operations:manage` see the stored operation before anything changes.
  await authorize(event, operationsAccess.permissions.manage, existing)
  const updated = await patchOperationRow(existing, patch)
  const operation = toAdminOperationDto(updated)
  // A patch that changed nothing returns the stored row itself, and fires no hook.
  if (updated !== existing) await useNitroApp().hooks.callHook('operations:updated', { event, operation, previous: toAdminOperationDto(existing) })
  return operation
})
