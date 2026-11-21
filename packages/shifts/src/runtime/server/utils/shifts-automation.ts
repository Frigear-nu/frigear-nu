import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, exists, gte, inArray, isNotNull, isNull, lte, notExists, sql } from 'drizzle-orm'
import { ladderKeys, roleAtLeast } from '@frigear-nu/teams/utils'
import type { ShiftExceptionKind, Translated } from '../../../types'
import { newId, translate } from '../../utils'
import { shiftsChunk } from '../../utils/chunk'
import { normalizeAutomationBatch } from '../../utils/checkin'
import { buildShiftDigestEmail } from '../digest-email'
import type { ShiftDigestLine } from '../digest-email'
import { formatShiftWhen } from '../reminder-email'
import { shiftsConfig, shiftsFire, shiftsLocalesOfMany, shiftsTeamsById, shiftsUsersById } from './shifts-core'
import { shiftsMarkAttendance } from './shifts-assign'
import { shiftsGrantPerks } from './shifts-perks'
import { shiftsLeadsOnDuty } from './shifts-views'
import { shiftsNotify } from './shifts-notify'
import { SHIFTS_TOPICS } from '../../notifications'

export type ShiftsCloseRunDto = {
  /** Ended shifts this run closed. */
  closed: number
  /** Perk grants made (new, or restored). */
  granted: number
  /** Assignments marked `no_show` by `autoNoShow`. */
  noShows: number
  /** Digest messages that went out (one per lead). */
  digests: number
  /** Exceptions claimed for a digest this run. */
  exceptions: number
}

const HOUR = 3_600_000

let shiftsWarnedNoOrigin = false

/**
 * The `shifts:close-shifts` task (every five minutes by default). Three steps, each idempotent on both dialects and
 * bounded by `automation.batchSize` (the next run takes the rest); every lookup by a list of ids runs in chunks below
 * D1's 100 bound parameters:
 * 1. **Shift end.** Ended shifts of published schedules not closed yet: their `attended` assignments get their perk
 *    grants (the unique `(perkId, assignmentId)` key makes a second grant a no-op), then the shift is marked
 *    `closedAt`. Nobody else changes: there is no `completed` status.
 * 2. **Auto no-show.** On schedules with `autoNoShow`, assignments still `assigned` without a check-in
 *    `autoNoShowMinutes` after the start (of shifts that started in the last 24 hours) become `no_show`, as the system
 *    (`by: null`, hooks with `auto: true` and `event: undefined`).
 * 3. **Digest.** The new exceptions (no-shows, people still not checked in `autoNoShowMinutes` after the start on
 *    schedules without auto no-show, and no-shows whose grant was claimed) are claimed in `shift_digest_items` (unique
 *    per kind and assignment: each is sent once) and go out as one message per lead: to the team's leads on duty, else
 *    its leads, else the coordinators of the operation (the explicit holders of the top role of a ladder on one of its
 *    teams), through `shiftsNotify` on the `shifts.digest` topic. Fires `shifts:digest:sent` per message.
 */
export async function shiftsCloseShifts(now = new Date(), event?: H3Event, override: { batchSize?: number } = {}): Promise<ShiftsCloseRunDto> {
  const config = shiftsConfig(event)
  const batchSize = override.batchSize ? normalizeAutomationBatch(override.batchSize) : config.automation.batchSize
  const result: ShiftsCloseRunDto = { closed: 0, granted: 0, noShows: 0, digests: 0, exceptions: 0 }

  // --- 1. Shift end -------------------------------------------------------------------------------------------------
  const ended = await db.select({ shift: schema.shifts, operationId: schema.shiftSchedules.operationId }).from(schema.shifts)
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(lte(schema.shifts.endsAt, now), isNull(schema.shifts.closedAt), eq(schema.shiftSchedules.status, 'published')))
    .orderBy(asc(schema.shifts.endsAt), asc(schema.shifts.id))
    .limit(batchSize)
  for (const part of shiftsChunk(ended)) {
    const byShift = new Map(part.map(row => [row.shift.id, row]))
    const attended = await db.select().from(schema.shiftAssignments)
      .where(and(inArray(schema.shiftAssignments.shiftId, [...byShift.keys()]), eq(schema.shiftAssignments.status, 'attended')))
    try {
      result.granted += await shiftsGrantPerks(event, attended.map(assignment => ({
        assignment,
        shift: byShift.get(assignment.shiftId)!.shift,
        schedule: { operationId: byShift.get(assignment.shiftId)!.operationId },
      })), now)
    }
    catch (error) {
      // Leave the shifts open: the next run tries again (granting is idempotent).
      console.error('[shifts] the perks of ended shifts could not be granted', error)
      continue
    }
    const closed = await db.update(schema.shifts).set({ closedAt: now })
      .where(and(inArray(schema.shifts.id, [...byShift.keys()]), isNull(schema.shifts.closedAt))).returning({ id: schema.shifts.id })
    result.closed += closed.length
  }

  // --- 2. Auto no-show ----------------------------------------------------------------------------------------------
  const autoSchedules = await db.select().from(schema.shiftSchedules)
    .where(and(eq(schema.shiftSchedules.autoNoShow, true), eq(schema.shiftSchedules.status, 'published')))
    .orderBy(asc(schema.shiftSchedules.id)).limit(100)
  let left = batchSize
  for (const schedule of autoSchedules) {
    if (left <= 0) break
    const cutoff = new Date(now.getTime() - schedule.autoNoShowMinutes * 60_000)
    const rows = await db.select({ assignment: schema.shiftAssignments, shift: schema.shifts }).from(schema.shiftAssignments)
      .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
      .where(and(
        eq(schema.shifts.scheduleId, schedule.id),
        eq(schema.shiftAssignments.status, 'assigned'),
        isNull(schema.shiftAssignments.checkedInAt),
        lte(schema.shifts.startsAt, cutoff),
        gte(schema.shifts.startsAt, new Date(now.getTime() - 24 * HOUR)),
      ))
      .orderBy(asc(schema.shifts.startsAt), asc(schema.shiftAssignments.id))
      .limit(left)
    left -= rows.length
    for (const { assignment, shift } of rows) {
      try {
        await shiftsMarkAttendance(undefined, { assignment, shift, schedule }, 'no_show', null, { auto: true, now })
        result.noShows++
      }
      catch (error) {
        // Somebody checked in or a lead marked them meanwhile: nothing to do.
        console.warn(`[shifts] assignment ${assignment.id} was not marked a no-show`, error)
      }
    }
  }

  // --- 3. Digest ----------------------------------------------------------------------------------------------------
  const claimedBefore = (kind: ShiftExceptionKind) => notExists(db.select({ one: sql`1` }).from(schema.shiftDigestItems).where(and(
    eq(schema.shiftDigestItems.assignmentId, schema.shiftAssignments.id),
    eq(schema.shiftDigestItems.kind, kind),
  )))
  const recent = gte(schema.shifts.startsAt, new Date(now.getTime() - 48 * HOUR))
  const select = () => db.select({ assignment: schema.shiftAssignments, shift: schema.shifts, operationId: schema.shiftSchedules.operationId, autoNoShow: schema.shiftSchedules.autoNoShow, autoNoShowMinutes: schema.shiftSchedules.autoNoShowMinutes })
    .from(schema.shiftAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
  type Candidate = Awaited<ReturnType<ReturnType<typeof select>['where']>>[number] & { kind: ShiftExceptionKind }
  const candidates: Candidate[] = []
  const noShows = await select().where(and(eq(schema.shiftSchedules.status, 'published'), eq(schema.shiftAssignments.status, 'no_show'), recent, claimedBefore('no_show')))
    .orderBy(asc(schema.shifts.startsAt)).limit(batchSize)
  candidates.push(...noShows.map(row => ({ ...row, kind: 'no_show' as const })))
  const claimedNoShows = await select().where(and(
    eq(schema.shiftSchedules.status, 'published'),
    eq(schema.shiftAssignments.status, 'no_show'),
    exists(db.select({ one: sql`1` }).from(schema.shiftPerkGrants).where(and(eq(schema.shiftPerkGrants.assignmentId, schema.shiftAssignments.id), isNotNull(schema.shiftPerkGrants.claimedAt)))),
    claimedBefore('claimed_no_show'),
  )).orderBy(asc(schema.shifts.startsAt)).limit(batchSize)
  candidates.push(...claimedNoShows.map(row => ({ ...row, kind: 'claimed_no_show' as const })))
  const missing = await select().where(and(
    eq(schema.shiftSchedules.status, 'published'),
    eq(schema.shiftSchedules.autoNoShow, false),
    eq(schema.shiftAssignments.status, 'assigned'),
    isNull(schema.shiftAssignments.checkedInAt),
    lte(schema.shifts.startsAt, now),
    gte(schema.shifts.startsAt, new Date(now.getTime() - 24 * HOUR)),
    claimedBefore('not_checked_in'),
  )).orderBy(asc(schema.shifts.startsAt)).limit(batchSize)
  candidates.push(...missing
    .filter(row => row.shift.startsAt.getTime() + row.autoNoShowMinutes * 60_000 <= now.getTime())
    .map(row => ({ ...row, kind: 'not_checked_in' as const })))

  // Claim each exception: the unique key lets one run (of two at once) send it.
  const claimed: Candidate[] = []
  for (const candidate of candidates.slice(0, batchSize)) {
    const [row] = await db.insert(schema.shiftDigestItems).values({
      id: newId('sdi'),
      kind: candidate.kind,
      assignmentId: candidate.assignment.id,
      teamId: candidate.shift.teamId,
      sentAt: now,
    }).onConflictDoNothing().returning({ id: schema.shiftDigestItems.id })
    if (row) claimed.push(candidate)
  }
  result.exceptions = claimed.length
  if (!claimed.length) return result

  // Who gets each team's exceptions.
  const byTeam = new Map<string, Candidate[]>()
  for (const item of claimed) byTeam.set(item.shift.teamId, [...(byTeam.get(item.shift.teamId) ?? []), item])
  const byRecipient = new Map<number, Candidate[]>()
  for (const [teamId, items] of byTeam) {
    let recipients: number[] = []
    try {
      recipients = await shiftsDigestRecipients(event, teamId, items[0]!.operationId, now)
    }
    catch (error) {
      console.error(`[shifts] the digest recipients of team ${teamId} could not be found`, error)
    }
    for (const userId of recipients) byRecipient.set(userId, [...(byRecipient.get(userId) ?? []), ...items])
  }
  if (!byRecipient.size) return result

  const [users, teams] = await Promise.all([
    shiftsUsersById([...byRecipient.keys(), ...claimed.map(item => item.assignment.userId)]),
    shiftsTeamsById([...byTeam.keys()]),
  ])
  const locales = await shiftsLocalesOfMany([...byRecipient].map(([userId, items]) => ({ userId, teamId: items[0]!.shift.teamId })))
  const origin = configuredAuthSiteOrigin(event)
  if (!origin && !shiftsWarnedNoOrigin) {
    shiftsWarnedNoOrigin = true
    console.warn('[shifts] no site origin is configured: digests go out without a link')
  }
  const leadPath = (useRuntimeConfig(event).public.shifts as { pages?: { lead?: string } } | undefined)?.pages?.lead
  for (const [userId, items] of byRecipient) {
    try {
      const recipient = users.get(userId)
      const locale = locales.get(`${userId}:${items[0]!.shift.teamId}`) ?? 'en'
      const lines: ShiftDigestLine[] = items.map(item => ({
        kind: item.kind,
        name: users.get(item.assignment.userId)?.name ?? `#${item.assignment.userId}`,
        team: translate((teams.get(item.shift.teamId)?.name ?? item.shift.teamId) as Translated, locale, 'en'),
        when: formatShiftWhen(item.shift.startsAt, locale, config.timeZone),
      }))
      const url = leadPath && origin ? `${origin}${leadPath.replace(':teamId', encodeURIComponent(items[0]!.shift.teamId))}` : undefined
      const email = buildShiftDigestEmail({ email: recipient?.email ?? null, name: recipient?.name ?? '', lines, url, locale })
      // Through `shiftsNotify`: with push installed the lead's own choice for the `shifts.digest` topic decides the
      // channels (email and push by default); without it, the email.
      const { channels } = await shiftsNotify(undefined, userId, {
        topic: SHIFTS_TOPICS.digest,
        email,
        push: email ? { title: email.subject, body: lines.length === 1 ? `${lines[0]!.name}: ${lines[0]!.team} ${lines[0]!.when}` : email.subject, ...(url ? { url } : {}) } : undefined,
        label: `the digest of user ${userId}`,
      })
      if (!channels.length) continue
      result.digests++
      await shiftsFire('shifts:digest:sent', { event: undefined, userId, items: items.map(item => ({ kind: item.kind, assignmentId: item.assignment.id, teamId: item.shift.teamId })), channels })
    }
    catch (error) {
      console.error(`[shifts] the digest of user ${userId} could not be handled`, error)
    }
  }
  return result
}

/**
 * Who gets a team's digest: its leads on shift now; else its leads (explicit members at or above the ladder's
 * `leadFrom`); else the coordinators of the operation (explicit holders of the top role of a ladder on one of its teams).
 */
export async function shiftsDigestRecipients(event: H3Event | undefined, teamId: string, operationId: string, now: Date): Promise<number[]> {
  const onDuty = await shiftsLeadsOnDuty(event, teamId, now, new Date(now.getTime() + 1))
  if (onDuty.length) return onDuty.map(person => person.userId)
  const ladders = await loadTeamLadders(event)
  const members = await db.select({ userId: schema.teamMembers.userId, role: schema.teamMembers.role, kind: schema.teams.kind }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .where(eq(schema.teamMembers.teamId, teamId)).limit(1000)
  const leads: number[] = []
  for (const member of members) {
    const ladder = ladders[member.kind]
    if (!ladder?.leadFrom || !roleAtLeast(ladderKeys(ladder), member.role, ladder.leadFrom)) continue
    if (await isTeamLead(event, member.userId, teamId)) leads.push(member.userId)
    if (leads.length >= 20) break
  }
  if (leads.length) return leads
  const operationMembers = await db.select({ userId: schema.teamMembers.userId, role: schema.teamMembers.role, kind: schema.teams.kind, teamId: schema.teams.id }).from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .where(and(eq(schema.teams.ownerType, 'operation'), eq(schema.teams.ownerId, operationId))).limit(5000)
  const coordinators = new Set<number>()
  for (const member of operationMembers) {
    const top = ladders[member.kind]?.roles.at(-1)?.key
    if (top && member.role === top && await isTeamLead(event, member.userId, member.teamId)) coordinators.add(member.userId)
    if (coordinators.size >= 20) break
  }
  return [...coordinators]
}
