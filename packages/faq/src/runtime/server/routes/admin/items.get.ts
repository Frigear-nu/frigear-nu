import { idParams } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'
import type { AdminFaqItemDto } from '../../../../types'

// Every item of a group, drafts included, in their order.
export default defineEventHandler(async (event): Promise<AdminFaqItemDto[]> => {
  await authorize(event, faqAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const group = await getFaqGroupOr404(id)
  await authorize(event, faqAccess.permissions.manage, group)
  return (await listFaqItemRows(group.id)).map(toAdminFaqItemDto)
})
