import type { H3Event } from 'h3'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq, gt, inArray, isNull, ne } from 'drizzle-orm'
import { generateUserToken, hashToken, shouldTouchLastUsed } from '@frigear-nu/auth/utils'
import { isoDate } from '@frigear-nu/module-kit/server'
import type { ShiftFeedStatusDto, ShiftFeedTokenDto, Translated } from '../../../types'
import { newId, translate } from '../../utils'
import { buildIcs } from '../../utils/ics'
import type { IcsEvent } from '../../utils/ics'
import { shiftsLocaleOf, shiftsTeamsById } from './shifts-core'

/** The prefix of a calendar feed secret. */
const FEED_TOKEN_PREFIX = 'sfk_'

/** How far back the feed reaches: calendar apps keep showing the last month. */
const FEED_BACKLOG_MS = 30 * 24 * 3_600_000

/** Whether I have a live feed, and when it was made and last read. The secret itself is never shown again. */
export async function shiftsFeedStatus(userId: number): Promise<ShiftFeedStatusDto> {
  const [row] = await db.select().from(schema.shiftFeedTokens)
    .where(and(eq(schema.shiftFeedTokens.userId, userId), isNull(schema.shiftFeedTokens.revokedAt))).limit(1)
  return row
    ? { active: true, prefix: row.prefix, createdAt: isoDate(row.createdAt), lastUsedAt: isoDate(row.lastUsedAt) }
    : { active: false, prefix: null, createdAt: null, lastUsedAt: null }
}

/**
 * Mints my feed secret: any earlier one is revoked, so there is one live URL per person. The URL carries the token and
 * is shown once (only its hash is stored). It points at the configured site origin, else the origin of this request.
 */
export async function shiftsMintFeedToken(event: H3Event, userId: number): Promise<ShiftFeedTokenDto> {
  await db.update(schema.shiftFeedTokens).set({ revokedAt: new Date() })
    .where(and(eq(schema.shiftFeedTokens.userId, userId), isNull(schema.shiftFeedTokens.revokedAt)))
  const { token, tokenHash, prefix } = await generateUserToken(FEED_TOKEN_PREFIX)
  await db.insert(schema.shiftFeedTokens).values({ id: newId('sft'), userId, tokenHash, prefix })
  const origin = configuredAuthSiteOrigin(event) ?? getRequestURL(event).origin
  const url = `${origin}/api/shifts/feed/${token}.ics`
  return { token, url, webcalUrl: url.replace(/^https?:\/\//, 'webcal://') }
}

/** Revokes my live feed secret: its URL answers 404 from now on. */
export async function shiftsRevokeFeedToken(userId: number): Promise<void> {
  await db.update(schema.shiftFeedTokens).set({ revokedAt: new Date() })
    .where(and(eq(schema.shiftFeedTokens.userId, userId), isNull(schema.shiftFeedTokens.revokedAt)))
}

/** The `.ics` of the person a feed secret belongs to; `undefined` for an unknown or revoked one. An optional `.ics` suffix is ignored. */
export async function shiftsFeedFor(event: H3Event, rawToken: string, now = new Date()): Promise<string | undefined> {
  const token = rawToken.replace(/\.ics$/i, '')
  if (!token || token.length > 200) return undefined
  const [row] = await db.select().from(schema.shiftFeedTokens)
    .where(and(eq(schema.shiftFeedTokens.tokenHash, await hashToken(token)), isNull(schema.shiftFeedTokens.revokedAt))).limit(1)
  if (!row) return undefined
  // Reading a feed is not a write: the time of the last read is kept at most every few minutes.
  if (shouldTouchLastUsed(row.lastUsedAt, now)) {
    await db.update(schema.shiftFeedTokens).set({ lastUsedAt: now }).where(eq(schema.shiftFeedTokens.id, row.id))
  }

  const rows = await db.select({ assignment: schema.shiftAssignments, shift: schema.shifts, schedule: schema.shiftSchedules })
    .from(schema.shiftAssignments)
    .innerJoin(schema.shifts, eq(schema.shifts.id, schema.shiftAssignments.shiftId))
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shifts.scheduleId))
    .where(and(
      eq(schema.shiftAssignments.userId, row.userId),
      ne(schema.shiftAssignments.status, 'cancelled'),
      eq(schema.shiftSchedules.status, 'published'),
      gt(schema.shifts.endsAt, new Date(now.getTime() - FEED_BACKLOG_MS)),
    ))
    .orderBy(asc(schema.shifts.startsAt), asc(schema.shiftAssignments.id))
    .limit(2000)

  const roleIds = [...new Set(rows.flatMap(item => item.assignment.shiftRoleId ? [item.assignment.shiftRoleId] : []))]
  const operationIds = [...new Set(rows.map(item => item.schedule.operationId))]
  const [teams, roles, operations] = await Promise.all([
    shiftsTeamsById(rows.map(item => item.shift.teamId)),
    roleIds.length ? db.select().from(schema.shiftRoles).where(inArray(schema.shiftRoles.id, roleIds)) : Promise.resolve([]),
    operationIds.length ? db.select({ id: schema.operations.id, name: schema.operations.name }).from(schema.operations).where(inArray(schema.operations.id, operationIds)) : Promise.resolve([]),
  ])
  const pagePath = (useRuntimeConfig(event).public.shifts as { pages?: { shift?: string } } | undefined)?.pages?.shift
  const origin = configuredAuthSiteOrigin(event) ?? getRequestURL(event).origin
  const locales = new Map<string, string>()
  const events: IcsEvent[] = []
  for (const { assignment, shift, schedule } of rows) {
    let locale = locales.get(shift.teamId)
    if (!locale) locales.set(shift.teamId, locale = await shiftsLocaleOf(row.userId, shift.teamId))
    const team = translate((teams.get(shift.teamId)?.name ?? shift.teamId) as Translated, locale, 'en')
    const role = roles.find(item => item.id === assignment.shiftRoleId)
    const operation = operations.find(item => item.id === schedule.operationId)
    const url = pagePath ? `${origin}${pagePath.replace(':assignmentId', encodeURIComponent(assignment.id))}` : undefined
    const notes = shift.notes ? translate(shift.notes as Translated, locale, 'en') : ''
    events.push({
      uid: `${assignment.id}@shifts.frigear-nu`,
      start: shift.startsAt,
      end: shift.endsAt,
      summary: role ? `${team} · ${translate(role.name as Translated, locale, 'en')}` : team,
      location: shift.location?.name ? translate(shift.location.name as Translated, locale, 'en') : undefined,
      description: [operation ? translate(operation.name as Translated, locale, 'en') : '', notes, url ?? ''].filter(Boolean).join('\n'),
      url,
      stamp: new Date(Math.max(assignment.updatedAt.getTime(), shift.updatedAt.getTime())),
    })
  }
  return buildIcs({ name: 'My shifts', events, generatedAt: now })
}
