import { idParams, noContent } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'

// Deletes an article, the reads of it and its places in checklists.
export default defineEventHandler(async (event) => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getHelpArticleOr404(id)
  await authorize(event, helpCenterAccess.permissions.manage, existing)
  await deleteHelpArticleRow(existing)
  return noContent(event)
})
