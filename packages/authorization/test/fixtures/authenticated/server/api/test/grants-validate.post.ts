import { z } from 'zod'

// Test only: validates a grant list as a route does before storing it (auth's `grantsValidate`, with this module's
// `role` kind), against an optional stored list.
export default defineEventHandler(async (event) => {
  const grant = z.looseObject({ kind: z.string() })
  const body = await readValidatedBody(event, z.object({ grants: z.array(grant), stored: z.array(grant).optional() }).parse)
  return grantsValidate(event, body.grants, { stored: body.stored })
})
