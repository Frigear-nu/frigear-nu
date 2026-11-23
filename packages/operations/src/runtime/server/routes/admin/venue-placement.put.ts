import { idParams, validationError } from '@frigear-nu/module-kit/server'
import { planePlacementSchema } from '@frigear-nu/maps/schemas'
import type { OperationVenuePlacementDto } from '../../../../types'
import { operationsAccess } from '../../../access'

// Replaces where the venue layout lies on the map and what is under it (`{ placement }`, a `PlanePlacement` of
// `@frigear-nu/maps`; `null` removes it). Saved apart from the layout, with its own `revision`: a placement someone
// changed since the client read it is not overwritten (409 `venue_placement_changed`).
export default defineEventHandler(async (event): Promise<OperationVenuePlacementDto> => {
  await authorize(event, operationsAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const body = await readValidatedBody(event, operationVenuePlacementInput.parse)
  const parsed = body.placement === null ? { success: true as const, data: null } : planePlacementSchema.safeParse(body.placement)
  if (!parsed.success) throw validationError(parsed.error.issues.map(issue => ({ path: ['placement', ...issue.path], message: issue.message })))
  const existing = await getOperationOr404(id)
  await authorize(event, operationsAccess.permissions.manage, existing)
  const row = await saveOperationVenuePlacement(existing, parsed.data, body.revision)
  return toOperationVenuePlacementDto(row)
})
