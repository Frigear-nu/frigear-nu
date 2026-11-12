// Open to everyone; a bearer credential without the permission counts as anonymous.
export default defineEventHandler(async (event) => {
  const principal = await getAuth(event)
  return { userId: principal && await allows(event, 'events:read') ? principal.user.id : null }
})
