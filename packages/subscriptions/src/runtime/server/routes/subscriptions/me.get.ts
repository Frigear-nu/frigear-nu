export default defineEventHandler(async (event) => {
  const user = await requireUser(event, { scopes: ['subscriptions:read'] })
  return listUserSubscriptions(user.id)
})
