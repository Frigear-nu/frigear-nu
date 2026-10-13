export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event, { sessionOnly: true })
  return [{ name: '*', description: 'Full access: everything you can do, except the personal-data (:pii) scopes, which must be chosen explicitly.' }, ...(await availableScopes(event, user as { id: number, role?: string }))]
})
