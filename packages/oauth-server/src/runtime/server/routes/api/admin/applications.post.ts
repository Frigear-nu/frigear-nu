import { created } from '@frigear-nu/module-kit/server'
import type { CreatedApplicationDto } from '../../../../../types'
import { applicationInputSchema, toAdminApplicationDto } from '../../../utils/oauth-applications'

// Creates an application. The response contains the client secret, which is only shown once.
export default defineEventHandler(async (event) => {
  const { userId } = await requireOAuthAdmin(event)
  const input = await readValidatedBody(event, applicationInputSchema.parse)
  const { application, secret } = await createApplication(input, userId)
  // `clientSecret` is `null` for public clients.
  return created<CreatedApplicationDto>(event, { ...toAdminApplicationDto(application, 0), clientId: application.id, clientSecret: secret })
})
