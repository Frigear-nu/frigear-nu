import { applicationPatchSchema } from '../../../utils/oauth-applications'

export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  const patch = await readValidatedBody(event, applicationPatchSchema.parse)
  const application = await updateApplication(id, patch)
  // Disabling an application also ends its sessions.
  if (patch.isActive === false) await revokeApplicationGrants(id)
  return application
})
