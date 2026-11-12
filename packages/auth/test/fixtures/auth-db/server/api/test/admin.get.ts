// `authorize` on a permission only admins hold.
export default defineEventHandler(async (event) => {
  const { user } = await authorize(event, 'events:admin')
  return { userId: user.id }
})
