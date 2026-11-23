import { idParams } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpCategoryKindChangeDto } from '../../../../types'

// What a change of the category to the other kind would affect, for the confirm dialog: the change itself is a `PATCH`
// with `kind`.
export default defineEventHandler(async (event): Promise<AdminHelpCategoryKindChangeDto> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const scope = await readHelpKindScope(event)
  const category = await getHelpCategoryOr404(id)
  assertHelpKindScope(helpCategoryKind(category.kind), scope, 'category')
  await authorize(event, helpCenterAccess.permissions.manage, category)
  return helpCategoryKindChange(category)
})
