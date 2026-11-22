import type { DashboardLayoutsDto } from '../../../../types'
import { dashboardAccess } from '../../../access'
import { readDashboardLayouts } from '../../layouts'

// `GET /api/dashboard/me/layouts` (`dashboard:layouts`: a session, or a token given it): the caller's saved layouts by
// dashboard name. A stored layout that no longer parses is left out. Only ever the caller's own.
export default defineEventHandler(async (event): Promise<DashboardLayoutsDto> => {
  const { user } = await authorize(event, dashboardAccess.permissions.layouts)
  return { layouts: await readDashboardLayouts(Number(user.id)) }
})
