import { z } from 'zod'

// Test-only: evaluates a grant list the way a content module does, for the caller (`matches`, `null` when anonymous),
// and lists its members. `validate: true` runs the kinds' reference checks instead (400 when one fails).
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, z.object({ grants: z.array(z.looseObject({ kind: z.string() })), validate: z.boolean().optional() }).parse)
  if (body.validate) {
    const parsed = grantsListSchema().safeParse(body.grants)
    if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid grants' })
    await grantsValidate(event, parsed.data)
    return { ok: true }
  }
  const principal = await getAuth(event)
  return {
    matches: await grantsMatch(event, principal?.user ?? null, body.grants),
    members: await grantsMembers(event, body.grants),
  }
})
