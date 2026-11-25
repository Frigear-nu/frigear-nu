import type { H3Event } from 'h3'
import { notConfigured } from '@frigear-nu/module-kit/server'
import { APP_SECRET_MIN_LENGTH, resolveSecret } from '@frigear-nu/module-kit/secret'
import { shiftsStationKeyIssue } from '../../utils/station-key'

// The station key: the secret station QR codes are signed with. `shifts.stationKey` (`NUXT_SHIFTS_STATION_KEY`) when
// set, else a key derived from Nuxt's `appSecret` (`NUXT_APP_SECRET`), so an app that sets only that secret has station
// check-in. A station key shorter than 32 characters stops the server at startup (`plugins/station-key`); where the
// environment only reaches a request (Cloudflare), it counts as no key here, with the reason logged, and the app secret
// does not stand in for it: a misconfigured key stays visible.

/** The `deriveSecret` purpose of the station key derived from `appSecret`. */
const STATION_SECRET_PURPOSE = '@frigear-nu/shifts:station'

let reported: string | undefined

/** `shifts.stationKey` (`NUXT_SHIFTS_STATION_KEY`) of the request, trimmed; empty when unset or too short. */
function ownStationKey(event?: H3Event): { key: string, invalid: boolean } {
  const config = useRuntimeConfig(event) as { shifts?: { stationKey?: unknown } }
  const secret = config.shifts?.stationKey
  const issue = shiftsStationKeyIssue(secret)
  if (issue) {
    if (reported !== issue) console.error(issue)
    reported = issue
    return { key: '', invalid: true }
  }
  return { key: typeof secret === 'string' ? secret.trim() : '', invalid: false }
}

/** Whether the request's `appSecret` (`NUXT_APP_SECRET`) is long enough to derive the station key from. */
function appSecretSet(event?: H3Event): boolean {
  const root = (useRuntimeConfig(event) as { appSecret?: unknown }).appSecret
  return typeof root === 'string' && root.length >= APP_SECRET_MIN_LENGTH
}

/**
 * The secret station tokens are signed with: `shifts.stationKey` (`NUXT_SHIFTS_STATION_KEY`), else one derived from
 * `appSecret` (`NUXT_APP_SECRET`); empty when neither is set, or when the station key is set but too short.
 */
export async function shiftsStationSecret(event?: H3Event): Promise<string> {
  const own = ownStationKey(event)
  if (own.invalid) return ''
  if (!own.key && !appSecretSet(event)) return ''
  return resolveSecret(STATION_SECRET_PURPOSE, own.key)
}

/**
 * Whether station check-in and station screens work: `shifts.stationKey` (`NUXT_SHIFTS_STATION_KEY`) is set and long
 * enough, or it is unset and `appSecret` (`NUXT_APP_SECRET`) is.
 */
export function shiftsStationKeyConfigured(event?: H3Event): boolean {
  const own = ownStationKey(event)
  if (own.invalid) return false
  return own.key !== '' || appSecretSet(event)
}

/** The 501 `not_configured` of station check-in without a station secret. */
export function shiftsStationKeyMissing() {
  return notConfigured('Station check-in is not set up: set NUXT_APP_SECRET (or NUXT_SHIFTS_STATION_KEY, at least 32 characters) on the server.')
}

/** 501 `not_configured` unless {@link shiftsStationKeyConfigured}. */
export function shiftsRequireStationKey(event?: H3Event): void {
  if (!shiftsStationKeyConfigured(event)) throw shiftsStationKeyMissing()
}
