export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'events:read')
  return { userId: user.id }
})
