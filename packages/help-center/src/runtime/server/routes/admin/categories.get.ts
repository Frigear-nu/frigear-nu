import { helpCenterAccess } from '../../../access'
import type { AdminHelpCategoryDto } from '../../../../types'

// Every category of the database, whatever its grants, in their order, with how many articles each has. A small,
// bounded list, so an array and not a page.
//   ?kind=   only `help` or only `faq` categories (the help center admin and the FAQ admin each ask for theirs)
export default defineEventHandler(async (event): Promise<AdminHelpCategoryDto[]> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const scope = await readHelpKindScope(event)
  const [rows, counts] = await Promise.all([listHelpCategoryRows(), helpCategoryCounts()])
  return rows.filter(row => !scope || helpCategoryKind(row.kind) === scope).map(row => toAdminHelpCategoryDto(row, counts.get(row.id)))
})
