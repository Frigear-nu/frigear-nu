import { z } from 'zod'
import type { DashboardLayoutsDto } from '../../../../types'
import { dashboardAccess } from '../../../access'
import { dashboardLayoutSchema, dashboardNameSchema } from '../../../preferences'
import { saveDashboardLayouts } from '../../layouts'

const bodySchema = z.object({ layouts: z.record(dashboardNameSchema, dashboardLayoutSchema.nullable()) }).strict()

// `PATCH /api/dashboard/me/layouts` (`dashboard:layouts`: a session, or a token given it): replaces the caller's layouts
// of the dashboards it names (`null` removes one) and keeps the others. Answers every stored layout, like the GET. The
// layouts are not in the session (a `managed` preference), so it is left alone. Only ever the caller's own.
export default defineEventHandler(async (event): Promise<DashboardLayoutsDto> => {
  const { user } = await authorize(event, dashboardAccess.permissions.layouts)
  const { layouts } = await readValidatedBody(event, bodySchema.parse)
  return { layouts: await saveDashboardLayouts(Number(user.id), layouts as Parameters<typeof saveDashboardLayouts>[1]) }
})
