export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  const applications = await listApplications()
  const grants = await countActiveGrants(applications.map(application => application.id))
  return applications.map(application => ({
    ...application,
    activeGrants: grants[application.id] ?? 0,
    // The redirect URI applications have to register on their side.
    callbackUrl: `${application.websiteUrl}${useOAuthConfig().callbackPath}`,
  }))
})
