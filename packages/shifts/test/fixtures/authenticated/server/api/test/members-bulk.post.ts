import { db, schema } from '@nuxthub/db'

// Test-only: adds `count` volunteers to a team in one go (user ids that need not exist), to test the size cap of a
// broadcast without a thousand requests.
export default defineEventHandler(async (event) => {
  const { teamId, count } = await readBody<{ teamId: string, count: number }>(event)
  const values = Array.from({ length: count }, (_value, index) => ({ id: `tmm_bulk_${teamId}_${index}`, teamId, userId: 1_000_000 + index, role: 'volunteer' }))
  for (let index = 0; index < values.length; index += 100) await db.insert(schema.teamMembers).values(values.slice(index, index + 100))
  return { ok: true, count }
})
