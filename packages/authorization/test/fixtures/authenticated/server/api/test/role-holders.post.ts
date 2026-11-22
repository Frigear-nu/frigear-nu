import { z } from 'zod'

// Test only: auth's `listRoleHolders` through this module's role provider (`holders`).
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, z.object({ roles: z.array(z.string()), limit: z.number().int().optional() }).parse)
  return { holders: await listRoleHolders(event, body.roles, { limit: body.limit }) }
})
