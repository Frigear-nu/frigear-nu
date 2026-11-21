import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gte, inArray, lte, ne } from 'drizzle-orm'
import type { ShiftExceptionDto } from '../../../types'
import { shiftsChunk } from '../../utils/chunk'
import { exceptionOf } from '../../utils/checkin'
import { toShiftDto } from './shifts-dto'
import { shiftsAssigneeDtos } from './shifts-core'
import { shiftsClaimedAssignmentIds } from './shifts-perks'

const HOUR = 3_600_000

/**
 * The exceptions of a team's shifts that started and ended at most a day ago (published schedules): no-shows (flagged
 * when a grant was claimed before the flip), people checked in late, and people still `assigned` after the start. Most
 * recent shift first; contact details only with `pii`.
 */
export async function shiftsTeamExceptions(teamId: string, pii: boolean, now = new Date()): Promise<ShiftExceptionDto[]> {
  const rows = await db.select({ shift: schema.shifts, schedule: schema.shiftSchedules }).from(schema.shifts)
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(
      eq(schema.shifts.teamId, teamId),
      eq(schema.shiftSchedules.status, 'published'),
      lte(schema.shifts.startsAt, now),
      gte(schema.shifts.endsAt, new Date(now.getTime() - 24 * HOUR)),
    ))
    .orderBy(asc(schema.shifts.startsAt), asc(schema.shifts.id))
    .limit(200)
  if (!rows.length) return []
  const byShift = new Map(rows.map(row => [row.shift.id, row]))
  const assignments = (await Promise.all(shiftsChunk([...byShift.keys()]).map(part => db.select().from(schema.shiftAssignments)
    .where(and(inArray(schema.shiftAssignments.shiftId, part), ne(schema.shiftAssignments.status, 'cancelled')))))).flat()
  const noShows = assignments.filter(row => row.status === 'no_show').map(row => row.id)
  const claimed = await shiftsClaimedAssignmentIds(noShows)
  const found = assignments.flatMap((assignment) => {
    const { shift } = byShift.get(assignment.shiftId)!
    const exception = exceptionOf(assignment, shift, now, { claimedGrant: claimed.has(assignment.id) })
    return exception ? [{ assignment, exception }] : []
  })
  const people = await shiftsAssigneeDtos(found.map(item => item.assignment), pii)
  const byId = new Map(people.map(person => [person.id, person]))
  return found
    .map(({ assignment, exception }) => {
      const { shift, schedule } = byShift.get(assignment.shiftId)!
      return { kind: exception.kind, assignment: byId.get(assignment.id)!, shift: toShiftDto(shift, schedule), ...(exception.lateMinutes === undefined ? {} : { lateMinutes: exception.lateMinutes }) }
    })
    .sort((a, b) => b.shift.startsAt.localeCompare(a.shift.startsAt))
}
