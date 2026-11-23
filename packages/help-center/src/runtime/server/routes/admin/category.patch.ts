import { idParams } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpCategoryDto } from '../../../../types'

// Edits any of the fields of a category.
export default defineEventHandler(async (event): Promise<AdminHelpCategoryDto> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const scope = await readHelpKindScope(event)
  const patch = await readValidatedBody(event, helpCategoryPatchSchema.parse)
  const existing = await getHelpCategoryOr404(id)
  assertHelpKindScope(helpCategoryKind(existing.kind), scope, 'category')
  await authorize(event, helpCenterAccess.permissions.manage, existing)
  const updated = await patchHelpCategoryRow(event, existing, patch)
  return toAdminHelpCategoryDto(updated, (await helpCategoryCounts()).get(updated.id))
})
