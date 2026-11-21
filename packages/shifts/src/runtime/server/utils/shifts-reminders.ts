import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, inArray, lte, notExists, or, sql } from 'drizzle-orm'
import type { Translated } from '../../../types'
import { newId, translate } from '../../utils'
import { shiftsChunk } from '../../utils/chunk'
import { dueReminderOffsets, normalizeReminderBatch, normalizeReminderOffsets, reminderOffsetToSend, timeLeftBucket } from '../../utils/reminders'
import { buildShiftReminderEmail, buildShiftReminderPush, buildShiftReminderSms, formatShiftWhen } from '../reminder-email'
import { toShiftAssignmentDto } from './shifts-dto'
import { shiftsConfig, shiftsFire, shiftsLocalesOfMany, shiftsRolesByIds, shiftsTeamsById, shiftsUsersById } from './shifts-core'
import { shiftsStillEligible } from './shifts-assign'
import { shiftsNotify } from './shifts-notify'
import { SHIFTS_TOPICS } from '../../notifications'

export type ShiftsReminderRunDto = {
  /** The due assignments this run took (at most `batchSize`, soonest shift first). */
  checked: number
  /** Reminders that went out (one per assignment and run). */
  sent: number
  /** Reminder rows spent without a message: a larger offset that fell due together with a smaller one, or a person who no longer holds their role. */
  spent: number
}

let shiftsWarnedNoOrigin = false

/**
 * Sends the reminders that are due at `now` (the `shifts:send-reminders` task, every ten minutes by default): for each
 * `assigned` assignment of a published schedule whose shift lies ahead, every configured offset (`reminders.offsets`,
 * minutes before the start) whose moment has passed is due. Each is claimed by inserting a `shift_reminders` row (the
 * unique `(assignmentId, offsetMinutes)` key makes the loser of two runs at once send nothing) and then sent. When
 * several offsets are due together (a late run, or a person assigned inside the window) one message goes out, for the
 * smallest, and the others are spent without one. A failed send keeps its row: a broken address is not retried every
 * run. A person who no longer holds their role on the team gets nothing, and their due offsets are spent so they do not
 * crowd later runs. Through `shiftsNotify`: the email and push notification, and the SMS only with `reminders.sms` and a phone number. With push installed the person's own choice for the `shifts.reminder` topic decides which of them go out; without it, email always. The message names the real time left,
 * in the person's language. Fires `shifts:reminder:sent` (`event` is always `undefined` when the task fires it).
 *
 * A run handles at most `reminders.batchSize` assignments (default 100), soonest shift first; rows with every due offset
 * already claimed are left out in SQL, so the next run takes the rest. Every lookup by a list of ids is chunked below
 * D1's 100 bound parameters. `override` replaces the module's `offsets`, `sms` and `batchSize` for one run (tests, a
 * one-off run by hand).
 */
export async function shiftsSendReminders(now = new Date(), event?: H3Event, override: { offsets?: number[], sms?: boolean, batchSize?: number } = {}): Promise<ShiftsReminderRunDto> {
  const config = shiftsConfig(event)
  const { timeZone } = config
  const reminders = {
    offsets: override.offsets ? normalizeReminderOffsets(override.offsets) : config.reminders.offsets,
    sms: override.sms ?? config.reminders.sms,
    batchSize: override.batchSize ? normalizeReminderBatch(override.batchSize) : config.reminders.batchSize,
  }
  const result: ShiftsReminderRunDto = { checked: 0, sent: 0, spent: 0 }
  if (!reminders.offsets.length) return result
  // Due: for some offset the moment has passed and no row claims it yet.
  const dueSomething = or(...reminders.offsets.map(offset => and(
    lte(schema.shifts.startsAt, new Date(now.getTime() + offset * 60_000)),
    notExists(db.select({ one: sql`1` }).from(schema.shiftReminders).where(and(
      eq(schema.shiftReminders.assignmentId, schema.shiftAssignments.id),
      eq(schema.shiftReminders.offsetMinutes, offset),
    ))),
  )))
  const rows = await db.select({ assignment: schema.shiftAssignments, shift: schema.shifts }).from(schema.shiftAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(
      eq(schema.shiftAssignments.status, 'assigned'),
      eq(schema.shiftSchedules.status, 'published'),
      gt(schema.shifts.startsAt, now),
      dueSomething,
    ))
    .orderBy(asc(schema.shifts.startsAt), asc(schema.shiftAssignments.id))
    .limit(reminders.batchSize)
  result.checked = rows.length
  if (!rows.length) return result

  const claimed = (await Promise.all(shiftsChunk(rows.map(row => row.assignment.id)).map(part =>
    db.select({ assignmentId: schema.shiftReminders.assignmentId, offsetMinutes: schema.shiftReminders.offsetMinutes }).from(schema.shiftReminders)
      .where(inArray(schema.shiftReminders.assignmentId, part))))).flat()
  const spentBefore = new Set(claimed.map(row => `${row.assignmentId}:${row.offsetMinutes}`))
  const [users, teams, roles, locales] = await Promise.all([
    shiftsUsersById(rows.map(row => row.assignment.userId)),
    shiftsTeamsById(rows.map(row => row.shift.teamId)),
    shiftsRolesByIds(rows.map(row => row.assignment.shiftRoleId)),
    shiftsLocalesOfMany(rows.map(row => ({ userId: row.assignment.userId, teamId: row.shift.teamId }))),
  ])
  const origin = configuredAuthSiteOrigin(event)
  if (!origin && !shiftsWarnedNoOrigin) {
    shiftsWarnedNoOrigin = true
    console.warn('[shifts] no site origin is configured: reminders go out without a link')
  }
  const shiftPath = (useRuntimeConfig(event).public.shifts as { pages?: { shift?: string } } | undefined)?.pages?.shift

  const claim = async (assignment: { id: string, userId: number }, offset: number) => {
    const [row] = await db.insert(schema.shiftReminders)
      .values({ id: newId('srm'), assignmentId: assignment.id, offsetMinutes: offset, userId: assignment.userId })
      .onConflictDoNothing().returning({ id: schema.shiftReminders.id })
    return !!row
  }

  for (const { assignment, shift } of rows) {
    const due = dueReminderOffsets(shift.startsAt, reminders.offsets, now).filter(offset => !spentBefore.has(`${assignment.id}:${offset}`))
    if (!due.length) continue
    try {
      if (!await shiftsStillEligible(event, assignment, shift.teamId)) {
        for (const offset of due) if (await claim(assignment, offset)) result.spent++
        continue
      }
      const toSend = reminderOffsetToSend(dueReminderOffsets(shift.startsAt, reminders.offsets, now))!
      let winsSend = false
      for (const offset of due) {
        if (!await claim(assignment, offset)) continue
        if (offset === toSend) winsSend = true
        else result.spent++
      }
      if (!winsSend) continue

      const user = users.get(assignment.userId)
      const locale = locales.get(`${assignment.userId}:${shift.teamId}`) ?? 'en'
      const role = assignment.shiftRoleId ? roles.get(assignment.shiftRoleId) : undefined
      const variables = {
        name: user?.name ?? '',
        team: translate((teams.get(shift.teamId)?.name ?? shift.teamId) as Translated, locale, 'en'),
        role: role ? translate(role.name as Translated, locale, 'en') : undefined,
        when: formatShiftWhen(shift.startsAt, locale, timeZone),
        where: shift.location?.name ? translate(shift.location.name as Translated, locale, 'en') : undefined,
        start: shift.startsAt.toISOString(),
      }
      const left = timeLeftBucket(shift.startsAt, now)
      const url = shiftPath && origin ? `${origin}${shiftPath.replace(':assignmentId', encodeURIComponent(assignment.id))}` : undefined
      const email = buildShiftReminderEmail({ email: user?.email ?? null, variables, offset: toSend, left, url, locale })
      // The text only when the module asks for it (`reminders.sms`); with push installed the person's own choice for the
      // `shifts.reminder` topic still decides whether it goes out.
      const sms = reminders.sms ? buildShiftReminderSms({ phone: user?.phone ?? null, variables, offset: toSend, left, url, locale }) : null
      const { channels } = await shiftsNotify(event, assignment.userId, {
        topic: SHIFTS_TOPICS.reminder,
        email,
        sms,
        push: buildShiftReminderPush({ variables, left, url, locale }),
        label: `the reminder of assignment ${assignment.id}`,
      })
      if (!channels.length) continue
      result.sent++
      await shiftsFire('shifts:reminder:sent', { event, assignment: toShiftAssignmentDto(assignment), offset: toSend, channels })
    }
    catch (error) {
      console.error(`[shifts] the reminder of assignment ${assignment.id} could not be handled`, error)
    }
  }
  return result
}
