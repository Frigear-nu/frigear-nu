import type { H3Event } from 'h3'
import type { z } from 'zod'
import { db, schema } from '@nuxthub/db'
import { and, asc, eq } from 'drizzle-orm'
import { renderSVG } from 'uqr'
import { apiError, notFound, validationError } from '@frigear-nu/module-kit/server'
import { OPERATIONS_STATION_KIND } from '@frigear-nu/operations/utils'
import type { ShiftStationTokenDto, Translated } from '../../../types'
import { newId } from '../../utils'
import { STATION_ROTATE_SECONDS, parseStationToken, stationTokenPayload, stationWindow, stationWindowAccepted } from '../../utils/checkin'
import { toShiftStationDto } from './shifts-dto'
import type { ShiftScheduleRow, ShiftStationRow } from './shifts-dto'
import { shiftsOperationTeamOr400 } from './shifts-core'
import type { shiftsStationInput, shiftsStationPatch } from './shifts-schemas'

type StationInput = z.output<typeof shiftsStationInput>
type StationPatch = z.output<typeof shiftsStationPatch>

// Check-in stations: a screen of a team showing a QR code that rotates every 30 seconds. The code is
// `<stationId>.<window>.<signature>`, the signature an HMAC-SHA-256 of `<stationId>:<window>` under a key derived (HKDF)
// from the app's secret. Nothing is stored per token: the window says when it was made, the signature that we made it.

const encoder = new TextEncoder()
const stationKeys = new Map<string, Promise<CryptoKey>>()

/**
 * The HMAC key of station tokens: HKDF-SHA-256 of `shifts.stationKey` (`NUXT_SHIFTS_STATION_KEY`), else the app secret
 * sessions are sealed with (`appSecret`, `NUXT_APP_SECRET`), else the session password (as auth's OAuth tokens fall back).
 */
function shiftsStationKey(event?: H3Event): Promise<CryptoKey> {
  const config = useRuntimeConfig(event) as { shifts?: { stationKey?: string }, appSecret?: string, session?: { password?: string } }
  const secret = config.shifts?.stationKey || config.appSecret || config.session?.password
  if (!secret) throw new Error('[shifts] Station check-in needs NUXT_SHIFTS_STATION_KEY or NUXT_APP_SECRET.')
  let key = stationKeys.get(secret)
  if (!key) {
    key = crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']).then(material => crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('@frigear-nu/shifts'), info: encoder.encode('shift_station_tokens') },
      material,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign', 'verify'],
    ))
    stationKeys.set(secret, key)
  }
  return key
}

const toBase64Url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
    const bytes = new Uint8Array(new ArrayBuffer(binary.length))
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
    return bytes
  }
  catch {
    return null
  }
}

/** The token of a station for a window (the current one by default). */
export async function shiftsStationToken(event: H3Event | undefined, stationId: string, window = stationWindow(Date.now())): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await shiftsStationKey(event), encoder.encode(stationTokenPayload(stationId, window)))
  return `${stationId}.${window}.${toBase64Url(signature)}`
}

/**
 * Checks a scanned station token: 400 `invalid_token` when it is not one or its signature does not verify (forged or
 * altered), 409 `token_expired` when it is from a window before the previous one (or from the future). Returns the
 * station id; the caller loads the station.
 */
export async function shiftsVerifyStationToken(event: H3Event | undefined, token: string, now = Date.now()): Promise<string> {
  const parsed = parseStationToken(token)
  const signature = parsed ? fromBase64Url(parsed.signature) : null
  const invalid = () => apiError(400, 'invalid_token', 'This is not a check-in code of a station.')
  if (!parsed || !signature) throw invalid()
  const valid = await crypto.subtle.verify('HMAC', await shiftsStationKey(event), signature, encoder.encode(stationTokenPayload(parsed.stationId, parsed.window)))
  if (!valid) throw invalid()
  if (!stationWindowAccepted(parsed.window, now)) throw apiError(409, 'token_expired', 'This code has expired. Scan the station again.')
  return parsed.stationId
}

export async function findShiftStation(id: string): Promise<ShiftStationRow | undefined> {
  const [row] = await db.select().from(schema.shiftStations).where(eq(schema.shiftStations.id, id)).limit(1)
  return row
}

export async function getShiftStationOr404(id: string): Promise<ShiftStationRow> {
  const row = await findShiftStation(id)
  if (!row) throw notFound('Station not found.')
  return row
}

/** A schedule's stations, oldest first. */
export async function shiftsListStations(scheduleId: string) {
  const rows = await db.select().from(schema.shiftStations).where(eq(schema.shiftStations.scheduleId, scheduleId))
    .orderBy(asc(schema.shiftStations.createdAt), asc(schema.shiftStations.id)).limit(500)
  return rows.map(toShiftStationDto)
}

/** The ids of the features of a venue layout of the station kind (`operations.station`). */
function stationFeatureIds(layout: unknown): Set<string> {
  const features = (layout as { features?: Array<{ id?: unknown, kind?: unknown }> } | null | undefined)?.features ?? []
  return new Set(features.filter(feature => feature.kind === OPERATIONS_STATION_KIND && typeof feature.id === 'string').map(feature => feature.id as string))
}

/** 400 on `featureId` unless it names a station feature of the operation's venue layout. */
async function assertStationFeature(operationId: string, featureId: string): Promise<void> {
  const [operation] = await db.select({ venueLayout: schema.operations.venueLayout }).from(schema.operations).where(eq(schema.operations.id, operationId)).limit(1)
  if (!stationFeatureIds(operation?.venueLayout).has(featureId)) {
    throw validationError([{ path: ['featureId'], message: 'Pick a station of the operation\'s venue layout.' }], 'Unknown station feature')
  }
}

/** Adds a station for a team of the schedule's operation, optionally on a station feature of the venue layout. */
export async function shiftsCreateStation(schedule: ShiftScheduleRow, input: StationInput): Promise<ShiftStationRow> {
  await shiftsOperationTeamOr400(schedule.operationId, input.teamId)
  if (input.featureId) await assertStationFeature(schedule.operationId, input.featureId)
  const [row] = await db.insert(schema.shiftStations).values({
    id: newId('sst'),
    scheduleId: schedule.id,
    teamId: input.teamId,
    name: input.name,
    featureId: input.featureId ?? null,
  }).returning()
  return row!
}

export async function shiftsPatchStation(station: ShiftStationRow, schedule: ShiftScheduleRow, patch: StationPatch): Promise<ShiftStationRow> {
  const values: Partial<typeof schema.shiftStations.$inferInsert> = {}
  if (patch.name !== undefined) values.name = patch.name
  if (patch.featureId !== undefined) {
    if (patch.featureId) await assertStationFeature(schedule.operationId, patch.featureId)
    values.featureId = patch.featureId ?? null
  }
  if (!Object.keys(values).length) return station
  const [row] = await db.update(schema.shiftStations).set(values).where(eq(schema.shiftStations.id, station.id)).returning()
  return row!
}

export async function shiftsDeleteStation(station: ShiftStationRow): Promise<void> {
  await db.delete(schema.shiftStations).where(eq(schema.shiftStations.id, station.id))
}

/** The stations of a team on published schedules, for its leads' page. */
export async function shiftsTeamStations(teamId: string) {
  const rows = await db.select({ station: schema.shiftStations }).from(schema.shiftStations)
    .innerJoin(schema.shiftSchedules, eq(schema.shiftSchedules.id, schema.shiftStations.scheduleId))
    .where(and(eq(schema.shiftStations.teamId, teamId), eq(schema.shiftSchedules.status, 'published')))
    .orderBy(asc(schema.shiftStations.createdAt), asc(schema.shiftStations.id)).limit(200)
  return rows.map(row => toShiftStationDto(row.station))
}

/** The current token of a station with its QR code, for the display page. */
export async function shiftsStationTokenDto(event: H3Event, station: ShiftStationRow, teamName: Translated): Promise<ShiftStationTokenDto> {
  const now = Date.now()
  const window = stationWindow(now)
  const token = await shiftsStationToken(event, station.id, window)
  return {
    station: { ...toShiftStationDto(station), teamName },
    token,
    svg: renderSVG(token, { border: 1 }),
    refreshAt: new Date((window + 1) * STATION_ROTATE_SECONDS * 1000).toISOString(),
    rotateSeconds: STATION_ROTATE_SECONDS,
  }
}
