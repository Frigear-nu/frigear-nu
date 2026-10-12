export default defineEventHandler(async (event) => {
  const user = await authorizeUsersAdmin(event, 'view')
  return { roles: await assignableRoles(event, user.id as number) }
})
