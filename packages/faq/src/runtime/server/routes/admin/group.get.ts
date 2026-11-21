import { idParams } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'
import type { AdminFaqGroupDto } from '../../../../types'

export default defineEventHandler(async (event): Promise<AdminFaqGroupDto> => {
  await authorize(event, faqAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const row = await getFaqGroupOr404(id)
  await authorize(event, faqAccess.permissions.manage, row)
  return faqGroupHookDto(row)
})
