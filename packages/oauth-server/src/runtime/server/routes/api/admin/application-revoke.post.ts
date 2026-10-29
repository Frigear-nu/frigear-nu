import { idParams } from '@frigear-nu/module-kit/server'
import { toAdminApplicationDto } from '../../../utils/oauth-applications'

// Revokes every refresh token of the application, signing all its users out. Answers the application (0 signed in).
export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const { id } = await getValidatedRouterParams(event, idParams().parse)
  const application = await requireApplication(id)
  await revokeApplicationGrants(id)
  return toAdminApplicationDto(application, 0)
})
