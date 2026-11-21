import { helpCenterAccess } from '../../../access'
import type { HelpChecklistDto } from '../../../../types'

// The onboarding checklists the caller may see, with the articles in them they may read and which they have read.
export default defineEventHandler(async (event): Promise<HelpChecklistDto[]> => {
  await authorize(event, helpCenterAccess.permissions.read)
  setResponseHeader(event, 'cache-control', 'private, no-store')
  return loadViewerChecklists(await helpCenterRequest(event))
})
