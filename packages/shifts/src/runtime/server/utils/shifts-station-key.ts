import type { H3Event } from 'h3'
import { notConfigured } from '@frigear-nu/module-kit/server'
import { shiftsStationKeyIssue } from '../../utils/station-key'

// The station key: the secret station QR codes are signed with. Station check-in needs it; nothing stands in for it.
// A key shorter than 32 characters stops the server at startup (`plugins/station-key`); where the environment only
// reaches a request (Cloudflare), it counts as no key here, with the reason logged.

let reported: string | undefined

/** `shifts.stationKey` (`NUXT_SHIFTS_STATION_KEY`), trimmed; empty when unset or too short. Station check-in has no other secret. */
export function shiftsStationSecret(event?: H3Event): string {
  const config = useRuntimeConfig(event) as { shifts?: { stationKey?: unknown } }
  const secret = config.shifts?.stationKey
  const issue = shiftsStationKeyIssue(secret)
  if (issue) {
    if (reported !== issue) console.error(issue)
    reported = issue
    return ''
  }
  return typeof secret === 'string' ? secret.trim() : ''
}

/** Whether `shifts.stationKey` (`NUXT_SHIFTS_STATION_KEY`) is set (and long enough), so station check-in and station screens work. */
export function shiftsStationKeyConfigured(event?: H3Event): boolean {
  return shiftsStationSecret(event) !== ''
}

/** 501 `not_configured` unless `shifts.stationKey` (`NUXT_SHIFTS_STATION_KEY`) is set and at least 32 characters. */
export function shiftsRequireStationKey(event?: H3Event): void {
  if (!shiftsStationKeyConfigured(event)) {
    throw notConfigured('Station check-in is not set up: the server has no station key of at least 32 characters (NUXT_SHIFTS_STATION_KEY).')
  }
}
