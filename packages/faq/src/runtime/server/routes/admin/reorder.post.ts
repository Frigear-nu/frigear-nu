import { idParams } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'
import type { AdminFaqItemDto } from '../../../../types'

// Puts the group's items in the order of `itemIds`, which must be exactly the group's item ids (drafts included).
// Anything else is `400 invalid_order`. Answers with the items in their new order.
export default defineEventHandler(async (event): Promise<AdminFaqItemDto[]> => {
  await authorize(event, faqAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const { itemIds } = await readValidatedBody(event, faqReorderInput.parse)
  const group = await getFaqGroupOr404(id)
  await authorize(event, faqAccess.permissions.manage, group)
  const items = await reorderFaqItems(group.id, itemIds)
  await callFaqGroupUpdated(event, group)
  return items.map(toAdminFaqItemDto)
})
