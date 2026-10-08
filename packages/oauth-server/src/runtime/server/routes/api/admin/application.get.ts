export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const application = await getApplication(getRouterParam(event, 'id') ?? '')
  if (!application) throw createError({ statusCode: 404, statusMessage: 'Application not found.' })
  return { ...application, callbackUrl: `${application.websiteUrl}${useOAuthConfig().callbackPath}` }
})
