import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'

// Deletes a checklist and its items. The reads of the articles stay.
export default defineEventHandler(async (event) => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getHelpChecklistOr404(id)
  await authorize(event, helpCenterAccess.permissions.manage, existing)
  await deleteHelpChecklistRow(existing.id)
  return noContent(event)
})
