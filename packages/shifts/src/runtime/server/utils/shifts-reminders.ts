import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, inArray, lte } from 'drizzle-orm'
import type { ShiftChannel, Translated } from '../../../types'
import { newId, translate } from '../../utils'
import { dueReminderOffsets, normalizeReminderOffsets, reminderOffsetToSend } from '../../utils/reminders'
import { buildShiftReminderEmail, buildShiftReminderSms } from '../reminder-email'
import { toShiftAssignmentDto } from './shifts-dto'
import { shiftsConfig, shiftsFire, shiftsLocaleOf, shiftsRoleById, shiftsTeamsById, shiftsUsersById } from './shifts-core'
import { shiftsStillEligible } from './shifts-assign'

export type ShiftsReminderRunDto = {
  /** Assignments whose shift lies inside the largest offset. */
  checked: number
  /** Reminders that went out (one per assignment and run). */
  sent: number
  /** Reminder rows spent without a message of their own (a larger offset that fell due together with a smaller one). */
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
 * run. A person who no longer holds their role on the team gets nothing (and no row). Email always, SMS only with
 * `reminders.sms` and a phone number. Fires `shifts:reminder:sent` (with `event: undefined` from the task). `override`
 * replaces the module's `offsets` and `sms` for one run (tests, a one-off run by hand).
 */
export async function shiftsSendReminders(now = new Date(), event?: H3Event, override: { offsets?: number[], sms?: boolean } = {}): Promise<ShiftsReminderRunDto> {
  const config = shiftsConfig(event)
  const { timeZone } = config
  const reminders = { offsets: override.offsets ? normalizeReminderOffsets(override.offsets) : config.reminders.offsets, sms: override.sms ?? config.reminders.sms }
  const result: ShiftsReminderRunDto = { checked: 0, sent: 0, spent: 0 }
  if (!reminders.offsets.length) return result
  const horizon = new Date(now.getTime() + Math.max(...reminders.offsets) * 60_000)
  const rows = await db.select({ assignment: schema.shiftAssignments, shift: schema.shifts }).from(schema.shiftAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(
      eq(schema.shiftAssignments.status, 'assigned'),
      eq(schema.shiftSchedules.status, 'published'),
      gt(schema.shifts.startsAt, now),
      lte(schema.shifts.startsAt, horizon),
    ))
    .orderBy(asc(schema.shifts.startsAt), asc(schema.shiftAssignments.id))
    .limit(5000)
  result.checked = rows.length
  if (!rows.length) return result

  const claimed = await db.select({ assignmentId: schema.shiftReminders.assignmentId, offsetMinutes: schema.shiftReminders.offsetMinutes }).from(schema.shiftReminders)
    .where(inArray(schema.shiftReminders.assignmentId, rows.map(row => row.assignment.id)))
  const spentBefore = new Set(claimed.map(row => `${row.assignmentId}:${row.offsetMinutes}`))
  const users = await shiftsUsersById(rows.map(row => row.assignment.userId))
  const teams = await shiftsTeamsById(rows.map(row => row.shift.teamId))
  const origin = configuredAuthSiteOrigin(event)
  if (!origin && !shiftsWarnedNoOrigin) {
    shiftsWarnedNoOrigin = true
    console.warn('[shifts] no site origin is configured: reminders go out without a link')
  }
  const shiftPath = (useRuntimeConfig(event).public.shifts as { pages?: { shift?: string } } | undefined)?.pages?.shift

  for (const { assignment, shift } of rows) {
    const due = dueReminderOffsets(shift.startsAt, reminders.offsets, now).filter(offset => !spentBefore.has(`${assignment.id}:${offset}`))
    if (!due.length) continue
    try {
      if (!await shiftsStillEligible(event, assignment, shift.teamId)) continue
      const toSend = reminderOffsetToSend(dueReminderOffsets(shift.startsAt, reminders.offsets, now))!
      let winsSend = false
      for (const offset of due) {
        const [claim] = await db.insert(schema.shiftReminders)
          .values({ id: newId('srm'), assignmentId: assignment.id, offsetMinutes: offset, userId: assignment.userId })
          .onConflictDoNothing().returning({ id: schema.shiftReminders.id })
        if (!claim) continue
        if (offset === toSend) winsSend = true
        else result.spent++
      }
      if (!winsSend) continue

      const user = users.get(assignment.userId)
      const locale = await shiftsLocaleOf(assignment.userId, shift.teamId)
      const role = await shiftsRoleById(assignment.shiftRoleId)
      const variables = {
        name: user?.name ?? '',
        team: translate((teams.get(shift.teamId)?.name ?? shift.teamId) as Translated, locale, 'en'),
        role: role ? translate(role.name as Translated, locale, 'en') : undefined,
        when: new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(shift.startsAt),
        where: shift.location?.name ? translate(shift.location.name as Translated, locale, 'en') : undefined,
        start: shift.startsAt.toISOString(),
      }
      const url = shiftPath && origin ? `${origin}${shiftPath.replace(':assignmentId', encodeURIComponent(assignment.id))}` : undefined
      const channels: ShiftChannel[] = []
      const email = buildShiftReminderEmail({ email: user?.email ?? null, variables, offset: toSend, url, locale })
      if (email) {
        await dispatchEmailNotification(email).then(() => channels.push('email')).catch((error: unknown) => {
          console.error(`[shifts] the reminder email of assignment ${assignment.id} could not be sent`, error)
        })
      }
      const sms = reminders.sms ? buildShiftReminderSms({ phone: user?.phone ?? null, variables, offset: toSend, url }) : null
      if (sms) {
        await dispatchSMSNotification(sms).then(() => channels.push('sms')).catch((error: unknown) => {
          console.error(`[shifts] the reminder SMS of assignment ${assignment.id} could not be sent`, error)
        })
      }
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
