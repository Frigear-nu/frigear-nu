import { conflict, idParams } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'
import type { AdminFaqItemDto } from '../../../../types'

// Turns a published item back into a draft: it disappears for everyone but staff. Fires `faq:group:updated`.
export default defineEventHandler(async (event): Promise<AdminFaqItemDto> => {
  const principal = await authorize(event, faqAccess.permissions.manage)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const existing = await getFaqItemOr404(id)
  await authorize(event, faqAccess.permissions.manage, existing)
  if (existing.status === 'draft') return toAdminFaqItemDto(existing)

  const row = await setFaqItemStatus(existing, 'draft', principal.user.id)
  if (!row) throw conflict('The item was changed by someone else. Reload it and try again.')
  await callFaqGroupUpdated(event, row.groupId)
  return toAdminFaqItemDto(row)
})
