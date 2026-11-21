import type { H3Event } from 'h3'
import { notConfigured } from '@frigear-nu/module-kit/server'

// The station key: the secret station QR codes are signed with. Station check-in needs it; nothing stands in for it.

/** `shifts.stationKey` (`NUXT_SHIFTS_STATION_KEY`), trimmed; empty when unset. Station check-in has no other secret. */
export function shiftsStationSecret(event?: H3Event): string {
  const config = useRuntimeConfig(event) as { shifts?: { stationKey?: unknown } }
  const secret = config.shifts?.stationKey
  return typeof secret === 'string' ? secret.trim() : ''
}

/** Whether `shifts.stationKey` (`NUXT_SHIFTS_STATION_KEY`) is set, so station check-in and station screens work. */
export function shiftsStationKeyConfigured(event?: H3Event): boolean {
  return shiftsStationSecret(event) !== ''
}

/** 501 `not_configured` unless `shifts.stationKey` (`NUXT_SHIFTS_STATION_KEY`) is set. */
export function shiftsRequireStationKey(event?: H3Event): void {
  if (!shiftsStationKeyConfigured(event)) throw notConfigured('Station check-in is not set up: the server has no station key (NUXT_SHIFTS_STATION_KEY).')
}
