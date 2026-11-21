import { created, idParams } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'
import type { AdminFaqItemDto } from '../../../../types'

// Adds a draft item at the end of the group. Publish it with `POST /api/admin/faq/items/:id/publish`.
export default defineEventHandler(async (event): Promise<AdminFaqItemDto> => {
  const principal = await authorize(event, faqAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const input = await readValidatedBody(event, faqItemInput.parse)
  const group = await getFaqGroupOr404(id)
  await authorize(event, faqAccess.permissions.manage, group)
  const row = await createFaqItemRow(event, group, input, principal.user.id)
  await callFaqGroupUpdated(event, group)
  return created(event, toAdminFaqItemDto(row))
})
