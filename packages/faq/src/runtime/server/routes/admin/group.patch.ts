import { idParams } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'
import type { AdminFaqGroupDto } from '../../../../types'

// Edits any of the fields of a group. A patch that changes nothing fires no hook.
export default defineEventHandler(async (event): Promise<AdminFaqGroupDto> => {
  await authorize(event, faqAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const patch = await readValidatedBody(event, faqGroupPatchSchema.parse)
  const existing = await getFaqGroupOr404(id)
  await authorize(event, faqAccess.permissions.manage, existing)
  const updated = await patchFaqGroupRow(event, existing, patch)
  if (updated === existing) return faqGroupHookDto(existing)
  return callFaqGroupUpdated(event, updated)
})
