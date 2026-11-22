import { z } from 'zod'

// Test only: the role provider's bulk read (`assignedRolesOf`), and whether `listRoleHolders` primed the request with it
// instead of reading each holder's roles on their own.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, z.object({ userIds: z.array(z.number().int()), roles: z.array(z.string()) }).parse)
  const byUser = await listAuthorizationRolesOf(body.userIds)
  const holders = await listRoleHolders(event, body.roles)
  return {
    roles: Object.fromEntries([...byUser].map(([id, roles]) => [id, roles])),
    holders,
    primed: [...(event.context.authAccess?.assigned.keys() ?? [])].map(Number),
  }
})
