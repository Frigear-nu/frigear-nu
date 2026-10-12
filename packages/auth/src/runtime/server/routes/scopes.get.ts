import { scopes } from '#auth/scopes'

export default defineEventHandler(async (event) => {
  await requireUser(event, { sessionOnly: true })
  return [{ name: '*', description: 'Full access: everything you can do.' }, ...scopes]
})
