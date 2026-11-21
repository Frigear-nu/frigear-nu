import { haversineMeters, isInLocation } from '@frigear-nu/maps/utils'
import type { GeoPoint, MapLocation } from '@frigear-nu/maps/utils'
import type { ShiftCheckInMode, ShiftCheckInRule, ShiftCheckInSettings, ShiftExceptionKind } from '../../types'

// Pure rules of check-in: which modes apply to a team's shifts, the rotation windows of station QR codes, the location
// check and the exceptions a lead sees. Shared by the server, the pages and the unit tests.

export const SHIFT_CHECK_IN_MODES = ['station', 'location', 'daily', 'lead'] as const satisfies readonly ShiftCheckInMode[]

/** The check-in settings of a schedule that never set any: the lead's scanner only (as before modes existed). */
export const DEFAULT_CHECK_IN: ShiftCheckInSettings = { modes: ['lead'] }

/** The radius of a check-in place set as a bare point, and the most a device's accuracy may be, in metres. */
export const DEFAULT_CHECK_IN_RADIUS = 150

/** How long a station's QR code lives, in seconds. The current and the previous window are accepted. */
export const STATION_ROTATE_SECONDS = 30

/** A stored `checkIn` value, typed and with the defaults filled in. */
export function checkInSettingsOf(value: unknown): ShiftCheckInSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<ShiftCheckInSettings>
  const modes = cleanModes(raw.modes) ?? DEFAULT_CHECK_IN.modes
  return {
    modes,
    location: raw.location ?? null,
    ...(raw.teams && Object.keys(raw.teams).length ? { teams: raw.teams } : {}),
  }
}

const cleanModes = (value: unknown): ShiftCheckInMode[] | undefined => Array.isArray(value)
  ? SHIFT_CHECK_IN_MODES.filter(mode => value.includes(mode))
  : undefined

/**
 * What applies to one team's shifts: the team's override of `modes` and `location` where it sets them, the schedule's
 * otherwise. `lead` is always in the result: a lead's scan works whatever the settings say.
 */
export function checkInRuleFor(settings: unknown, teamId: string): ShiftCheckInRule {
  const schedule = checkInSettingsOf(settings)
  const team = schedule.teams?.[teamId]
  const modes = cleanModes(team?.modes) ?? schedule.modes
  const location = team && team.location !== undefined ? team.location ?? null : schedule.location ?? null
  return { modes: modes.includes('lead') ? modes : [...modes, 'lead'], location }
}

/** The radius a location check uses: the place's own radius, else the default (an area checks its outline instead). */
export const checkInRadius = (location: MapLocation): number => location.radiusMeters ?? DEFAULT_CHECK_IN_RADIUS

/**
 * Whether a reported position passes the location check: inside the place (its area, or within its radius, 150 m for a
 * bare point) and reported at least as accurately as that radius. `outside` and `inaccurate` name the 409 code.
 */
export function checkLocation(location: MapLocation, position: GeoPoint, accuracy: number): { ok: true } | { ok: false, reason: 'outside' | 'inaccurate', distance: number, radius: number } {
  const radius = checkInRadius(location)
  const distance = Math.round(haversineMeters(position, location.point))
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > radius) return { ok: false, reason: 'inaccurate', distance, radius }
  const inside = location.area?.length ? isInLocation(position, location) : distance <= radius
  return inside ? { ok: true } : { ok: false, reason: 'outside', distance, radius }
}

/** The rotation window an instant falls in. */
export const stationWindow = (now: number, rotateSeconds = STATION_ROTATE_SECONDS) => Math.floor(now / (rotateSeconds * 1000))

/** Whether a token of `window` is still accepted at `now`: the current window and the one before. */
export const stationWindowAccepted = (window: number, now: number, rotateSeconds = STATION_ROTATE_SECONDS) => {
  const current = stationWindow(now, rotateSeconds)
  return window === current || window === current - 1
}

/** What a station token signs: the station and the window. */
export const stationTokenPayload = (stationId: string, window: number) => `${stationId}:${window}`

/** Splits a station token (`<stationId>.<window>.<signature>`); `null` when it is not one. */
export function parseStationToken(token: string): { stationId: string, window: number, signature: string } | null {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return null
  const [stationId, window, signature] = parts as [string, string, string]
  if (!/^sst_[\da-f]{1,64}$/i.test(stationId) || !/^\d{1,15}$/.test(window) || !/^[\w-]{20,100}$/.test(signature)) return null
  return { stationId, window: Number(window), signature }
}

/** The exception of an assignment at `now`, or `null`. `graceMinutes` is how long after the start nobody is "missing" yet. */
export function exceptionOf(
  assignment: { status: string, checkedInAt: Date | null },
  shift: { startsAt: Date },
  now: Date,
  options: { graceMinutes?: number, claimedGrant?: boolean } = {},
): { kind: ShiftExceptionKind, lateMinutes?: number } | null {
  if (assignment.status === 'no_show') return { kind: options.claimedGrant ? 'claimed_no_show' : 'no_show' }
  if (assignment.status === 'attended' && assignment.checkedInAt && assignment.checkedInAt.getTime() > shift.startsAt.getTime() + 60_000) {
    return { kind: 'late', lateMinutes: Math.round((assignment.checkedInAt.getTime() - shift.startsAt.getTime()) / 60_000) }
  }
  if (assignment.status === 'assigned' && now.getTime() >= shift.startsAt.getTime() + (options.graceMinutes ?? 0) * 60_000) return { kind: 'not_checked_in' }
  return null
}

/** The most rows of each kind one run of `shifts:close-shifts` takes. */
export const DEFAULT_AUTOMATION_BATCH = 200
export const MAX_AUTOMATION_BATCH = 1000

export function normalizeAutomationBatch(value: unknown): number {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) && number > 0 ? Math.min(number, MAX_AUTOMATION_BATCH) : DEFAULT_AUTOMATION_BATCH
}
