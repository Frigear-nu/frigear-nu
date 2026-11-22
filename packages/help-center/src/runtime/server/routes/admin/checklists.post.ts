import { created } from '@frigear-nu/module-kit/server'
import { helpCenterAccess } from '../../../access'
import type { AdminHelpChecklistDto } from '../../../../types'

// Creates a checklist, optionally with its items (`items: [{ articleId, required? }]`, in order).
export default defineEventHandler(async (event): Promise<AdminHelpChecklistDto> => {
  await authorize(event, helpCenterAccess.permissions.manage)
  const input = await readValidatedBody(event, helpChecklistInput.parse)
  return created(event, await toAdminHelpChecklistDto(event, await createHelpChecklistRow(event, input)))
})
