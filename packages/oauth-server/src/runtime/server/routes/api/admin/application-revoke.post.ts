// Revokes every refresh token of the application, signing all its users out.
export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!(await getApplication(id))) throw createError({ statusCode: 404, statusMessage: 'Application not found.' })
  await revokeApplicationGrants(id)
  return { revoked: true }
})
