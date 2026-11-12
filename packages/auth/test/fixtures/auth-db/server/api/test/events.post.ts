export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'events:write')
  return { userId: user.id }
})
