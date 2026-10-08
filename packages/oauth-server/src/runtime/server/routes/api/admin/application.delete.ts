export default defineEventHandler(async (event) => {
  await requireOAuthAdmin(event)
  await deleteApplication(getRouterParam(event, 'id') ?? '')
  setResponseStatus(event, 204)
  return null
})
