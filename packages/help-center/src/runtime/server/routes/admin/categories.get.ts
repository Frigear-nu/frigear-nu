import { helpCenterAccess } from '../../../access'
import type { AdminHelpCategoryDto } from '../../../../types'

// Every category of the database, whatever its visibility, in their order, with how many articles each has. A small,
// bounded list, so an array and not a page.
export default defineEventHandler(async (event): Promise<AdminHelpCategoryDto[]> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const [rows, counts] = await Promise.all([listHelpCategoryRows(), helpCategoryCounts()])
  return rows.map(row => toAdminHelpCategoryDto(row, counts.get(row.id)))
})
