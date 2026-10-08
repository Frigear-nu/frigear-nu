import { applicationInputSchema } from '../../../utils/oauth-applications'

// Creates an application. The response contains the client secret, which is only shown once.
export default defineEventHandler(async (event) => {
  const { userId } = await requireOAuthAdmin(event)
  const input = await readValidatedBody(event, applicationInputSchema.parse)
  const { application, secret } = await createApplication(input, userId)
  setResponseStatus(event, 201)
  return { ...application, clientId: application.id, clientSecret: secret }
})
