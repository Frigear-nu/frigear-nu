import { db, schema } from '@nuxthub/db'
import { inArray } from 'drizzle-orm'

// Test-only: puts `count` new people on a shift in one go (a user, an explicit team membership and an `assigned`
// assignment each), to test runs that are bigger than a request's worth of bound parameters. Answers their emails.
export default defineEventHandler(async (event) => {
  const { shiftId, teamId, count, prefix = 'bulk' } = await readBody<{ shiftId: string, teamId: string, count: number, prefix?: string }>(event)
  const stamp = Date.now()
  const emails = Array.from({ length: count }, (_value, index) => `${prefix}${stamp}-${index}@bulk.test`)
  const ids: number[] = []
  for (let index = 0; index < emails.length; index += 20) {
    const rows = await db.insert(schema.users).values(emails.slice(index, index + 20).map((email, offset) => ({ name: `Bulk ${index + offset}`, email }))).returning({ id: schema.users.id })
    ids.push(...rows.map(row => Number(row.id)))
  }
  for (let index = 0; index < ids.length; index += 20) {
    const part = ids.slice(index, index + 20)
    await db.insert(schema.teamMembers).values(part.map(userId => ({ id: `tmm_bulk_${stamp}_${userId}`, teamId, userId, role: 'volunteer' })))
    await db.insert(schema.shiftAssignments).values(part.map(userId => ({
      id: `sha_bulk_${stamp}_${userId}`,
      shiftId,
      userId,
      status: 'assigned',
      checkInCode: `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`,
    })))
  }
  const check = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(schema.users.id, ids.slice(0, 50)))
  return { emails, created: ids.length, verified: check.length }
})
