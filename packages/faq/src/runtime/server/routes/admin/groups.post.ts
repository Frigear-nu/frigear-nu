import { created } from '@frigear-nu/module-kit/server'
import { faqAccess } from '../../../access'
import type { AdminFaqGroupDto } from '../../../../types'

// Creates an empty group. Add its items with `POST /api/admin/faq/groups/:id/items`.
export default defineEventHandler(async (event): Promise<AdminFaqGroupDto> => {
  await authorize(event, faqAccess.permissions.manage)
  const input = await readValidatedBody(event, faqGroupInput.parse)
  const row = await createFaqGroupRow(event, input)
  return created(event, await callFaqGroupUpdated(event, row))
})
