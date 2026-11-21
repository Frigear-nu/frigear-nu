import { created } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpCategoryDto } from '../../../../types'

// Creates an empty category. File articles in it with `POST /api/admin/help-center/articles`.
export default defineEventHandler(async (event): Promise<AdminHelpCategoryDto> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const input = await readValidatedBody(event, helpCategoryInput.parse)
  return created(event, toAdminHelpCategoryDto(await createHelpCategoryRow(event, input)))
})
