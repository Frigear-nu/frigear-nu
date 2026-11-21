import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'

// Deletes a category without articles (`409 category_not_empty` otherwise). Its subcategories move up a level.
export default defineEventHandler(async (event) => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getHelpCategoryOr404(id)
  await authorize(event, helpCenterAccess.permissions.manage, existing)
  await deleteHelpCategoryRow(existing)
  return noContent(event)
})
