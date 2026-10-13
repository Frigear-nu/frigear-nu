import { hasScopes } from '../../../../../../src/runtime/utils/scopes'

// Open to everyone; a bearer credential without the scope counts as anonymous.
export default defineEventHandler(async (event) => {
  const principal = await getAuth(event)
  return { userId: principal && hasScopes(principal.scopes, ['events:read']) ? principal.user.id : null }
})
