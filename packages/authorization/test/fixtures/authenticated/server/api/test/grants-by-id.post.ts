import { z } from 'zod'

// Test only: evaluates a grant list for another user named by id only (`{ id }`, as a recipient check passes it).
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, z.object({ userId: z.number().int(), grants: z.array(z.looseObject({ kind: z.string() })) }).parse)
  return { matches: await grantsMatch(event, { id: body.userId }, body.grants) }
})
