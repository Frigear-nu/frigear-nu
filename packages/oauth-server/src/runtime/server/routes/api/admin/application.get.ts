import { idParams } from '@frigear-nu/module-kit/server'
import { toAdminApplicationDto } from '../../../utils/oauth-applications'

export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const application = await requireApplication(id)
  const grants = await countActiveGrants([id])
  return toAdminApplicationDto(application, grants[id] ?? 0)
})
