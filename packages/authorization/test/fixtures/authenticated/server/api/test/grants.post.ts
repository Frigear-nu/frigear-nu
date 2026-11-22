import { z } from 'zod'

// Test only: evaluates a grant list (auth's grant lists, with this module's `role` kind) for the caller (`matches`,
// `null` when anonymous) and lists its members.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, z.object({ grants: z.array(z.looseObject({ kind: z.string() })) }).parse)
  const principal = await getAuth(event)
  return {
    matches: await grantsMatch(event, principal?.user ?? null, body.grants),
    members: await grantsMembers(event, body.grants),
  }
})
