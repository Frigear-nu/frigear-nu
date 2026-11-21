import type { H3Event } from 'h3'
import type { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { roleAtLeast } from '@frigear-nu/audience'
import { apiError, validationError } from '@frigear-nu/module-kit/server'
import { ladderKeys } from '@frigear-nu/teams/utils'
import type { ShiftBroadcastDto, ShiftBroadcastResultDto, Translated } from '../../../types'
import { newId, translate } from '../../utils'
import { shiftsChunk } from '../../utils/chunk'
import { ACTIVE_ASSIGNMENT_STATUSES } from '../../utils/status'
import { buildShiftBroadcastEmail, buildShiftBroadcastSms } from '../reminder-email'
import { toShiftBroadcastDto } from './shifts-dto'
import { findShiftEntry, shiftsFire, shiftsLocalesOfMany, shiftsOperationTeamOr400, shiftsUsersById } from './shifts-core'
import type { shiftsBroadcastInput } from './shifts-schemas'

type BroadcastInput = z.output<typeof shiftsBroadcastInput>

/** The most people one broadcast reaches: a bigger audience is a 400 `audience_too_large` (split it by team). */
export const SHIFTS_BROADCAST_CAP = 500

/** A person a broadcast reaches, with the team they were found through (their locale comes from it). */
export type ShiftsBroadcastRecipient = { userId: number, teamId: string }

/**
 * Who a broadcast goes to. With `shiftId`: the people holding a place on that shift (it must belong to the operation,
 * and to `teamId` when that is given; `teamRole` cannot be combined with it). Otherwise the active explicit members of
 * the operation's teams (`teamId` narrows to one team) whose role is at least `teamRole` on their team kind's ladder.
 * One entry per person.
 */
export async function shiftsBroadcastRecipients(event: H3Event, operationId: string, audience: BroadcastInput['audience']): Promise<{ recipients: ShiftsBroadcastRecipient[], teamId: string | null, shiftId: string | null }> {
  const people = new Map<number, ShiftsBroadcastRecipient>()
  if (audience.shiftId) {
    if (audience.teamRole) throw validationError([{ path: ['audience', 'teamRole'], message: 'A team role cannot be combined with a shift.' }])
    const entry = await findShiftEntry(audience.shiftId)
    if (!entry || entry.schedule.operationId !== operationId) {
      throw validationError([{ path: ['audience', 'shiftId'], message: 'The shift must belong to the operation.' }], 'Unknown shift')
    }
    if (audience.teamId && audience.teamId !== entry.shift.teamId) {
      throw validationError([{ path: ['audience', 'shiftId'], message: 'The shift belongs to another team.' }], 'Unknown shift')
    }
    const rows = await db.select({ userId: schema.shiftAssignments.userId }).from(schema.shiftAssignments).where(and(
      eq(schema.shiftAssignments.shiftId, entry.shift.id),
      inArray(schema.shiftAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
    ))
    for (const row of rows) people.set(row.userId, { userId: row.userId, teamId: entry.shift.teamId })
    return { recipients: [...people.values()], teamId: entry.shift.teamId, shiftId: entry.shift.id }
  }

  const teams = audience.teamId
    ? [await shiftsOperationTeamOr400(operationId, audience.teamId, 'audience.teamId')]
    : await db.select().from(schema.teams).where(and(eq(schema.teams.ownerType, 'operation'), eq(schema.teams.ownerId, operationId)))
  if (teams.length) {
    const [memberLists, ladders] = await Promise.all([
      // In chunks: D1 binds at most 100 parameters per statement.
      Promise.all(shiftsChunk(teams.map(team => team.id)).map(part =>
        db.select({ teamId: schema.teamMembers.teamId, userId: schema.teamMembers.userId, role: schema.teamMembers.role, status: schema.teamMembers.status })
          .from(schema.teamMembers).where(inArray(schema.teamMembers.teamId, part)).limit(5000))),
      loadTeamLadders(event),
    ])
    const members = memberLists.flat()
    const kindOf = new Map(teams.map(team => [team.id, team.kind]))
    for (const member of members) {
      if (!teamMemberStatusGrants(member.status) || people.has(member.userId)) continue
      if (audience.teamRole) {
        const ladder = ladders[kindOf.get(member.teamId) ?? '']
        if (!ladder || !roleAtLeast(ladderKeys(ladder), member.role, audience.teamRole)) continue
      }
      people.set(member.userId, { userId: member.userId, teamId: member.teamId })
    }
  }
  return { recipients: [...people.values()], teamId: audience.teamId ?? null, shiftId: null }
}

/**
 * Sends a broadcast: resolves the audience (400 `audience_empty` for nobody, 400 `audience_too_large` past
 * `SHIFTS_BROADCAST_CAP`), the people and their locales (so a failure there leaves no history row), stores it, then emails
 * each person (and texts the ones with a phone number when `sms` is among the channels) the subject and message in their
 * own locale. SMS is opt-in per broadcast because it costs money. A delivery that fails is logged and skipped: the
 * broadcast stands.
 *
 * Delivery runs in Cloudflare's `waitUntil` when the app runs on Workers, so the request returns once the
 * row is stored, with `delivery: 'queued'` and no counts; the totals, failures included, are logged when it ends. Without
 * one (Node) it is awaited and `sent` says how many went out. Fires `shifts:broadcast:sent` once delivery is over.
 */
export async function shiftsSendBroadcast(event: H3Event, input: BroadcastInput, by: number): Promise<ShiftBroadcastResultDto> {
  const { recipients, teamId, shiftId } = await shiftsBroadcastRecipients(event, input.operationId, input.audience)
  if (!recipients.length) throw apiError(400, 'audience_empty', 'Nobody matches this audience.')
  if (recipients.length > SHIFTS_BROADCAST_CAP) {
    throw apiError(400, 'audience_too_large', `A broadcast reaches at most ${SHIFTS_BROADCAST_CAP} people: this one reaches ${recipients.length}. Narrow it to a team, a role or a shift.`, { cap: SHIFTS_BROADCAST_CAP, recipients: recipients.length })
  }
  const [users, locales] = await Promise.all([shiftsUsersById(recipients.map(item => item.userId)), shiftsLocalesOfMany(recipients)])
  const [row] = await db.insert(schema.shiftBroadcasts).values({
    id: newId('shb'),
    operationId: input.operationId,
    teamId,
    shiftId,
    teamRole: input.audience.teamRole ?? null,
    channels: input.channels,
    subject: input.subject,
    message: input.message,
    recipientCount: recipients.length,
    sentBy: by,
  }).returning()
  const broadcast = toShiftBroadcastDto(row!)

  const sent = { email: 0, sms: 0 }
  const failed = { email: 0, sms: 0 }
  const deliver = async (recipient: ShiftsBroadcastRecipient) => {
    const user = users.get(recipient.userId)
    const locale = locales.get(`${recipient.userId}:${recipient.teamId}`) ?? 'en'
    const subject = translate(input.subject as Translated, locale, 'en')
    const message = translate(input.message as Translated, locale, 'en')
    if (input.channels.includes('email')) {
      const email = buildShiftBroadcastEmail({ email: user?.email ?? null, name: user?.name ?? '', subject, message, locale })
      if (email) {
        await dispatchEmailNotification(email).then(() => sent.email++).catch((error: unknown) => {
          failed.email++
          console.error(`[shifts] the broadcast ${row!.id} could not be emailed to user ${recipient.userId}`, error)
        })
      }
    }
    if (input.channels.includes('sms')) {
      const sms = buildShiftBroadcastSms({ phone: user?.phone ?? null, subject, message })
      if (sms) {
        await dispatchSMSNotification(sms).then(() => sent.sms++).catch((error: unknown) => {
          failed.sms++
          console.error(`[shifts] the broadcast ${row!.id} could not be texted to user ${recipient.userId}`, error)
        })
      }
    }
  }
  const run = async () => {
    for (let index = 0; index < recipients.length; index += 10) {
      await Promise.all(recipients.slice(index, index + 10).map(deliver))
    }
    console.info(`[shifts] broadcast ${row!.id} delivered: ${sent.email} emails and ${sent.sms} texts sent, ${failed.email} emails and ${failed.sms} texts failed`)
    await shiftsFire('shifts:broadcast:sent', { event, broadcast })
  }
  const waitUntil = shiftsWaitUntil(event)
  if (waitUntil) {
    waitUntil(run().catch((error: unknown) => console.error(`[shifts] the delivery of broadcast ${row!.id} failed`, error)))
    return { ...broadcast, sent, delivery: 'queued' }
  }
  await run()
  return { ...broadcast, sent, delivery: 'done' }
}

/**
 * Cloudflare's `waitUntil` for this request, if the app runs on Workers. Elsewhere (Node, where Nitro's own
 * `event.waitUntil` only collects promises) delivery is awaited, so the answer carries the counts.
 */
function shiftsWaitUntil(event: H3Event): ((promise: Promise<unknown>) => void) | undefined {
  const context = (event.context as { cloudflare?: { context?: { waitUntil?: (promise: Promise<unknown>) => void } } }).cloudflare?.context
  return typeof context?.waitUntil === 'function' ? promise => context.waitUntil!(promise) : undefined
}

/** The broadcasts of an operation, newest first (the last 100). */
export async function shiftsListBroadcasts(operationId: string): Promise<ShiftBroadcastDto[]> {
  const rows = await db.select().from(schema.shiftBroadcasts).where(eq(schema.shiftBroadcasts.operationId, operationId))
    .orderBy(desc(schema.shiftBroadcasts.createdAt), desc(schema.shiftBroadcasts.id)).limit(100)
  return rows.map(toShiftBroadcastDto)
}
