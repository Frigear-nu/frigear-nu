// The station key's rules, framework free: the module checks a key set at build time, the server plugin the one it
// starts with, and the server utils every key they read.

/** The shortest station key shifts accepts: station codes are signed with a key derived from it. */
export const SHIFTS_STATION_KEY_MIN_LENGTH = 32

/**
 * Why `value` cannot be the station key, or `undefined` when it can. An empty key is allowed (station check-in is then
 * off); a set key must be at least {@link SHIFTS_STATION_KEY_MIN_LENGTH} characters once trimmed.
 */
export function shiftsStationKeyIssue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return '[shifts] NUXT_SHIFTS_STATION_KEY (`shifts.stationKey`) must be a string.'
  const length = value.trim().length
  if (length === 0 || length >= SHIFTS_STATION_KEY_MIN_LENGTH) return undefined
  return `[shifts] NUXT_SHIFTS_STATION_KEY (\`shifts.stationKey\`) is ${length} characters long; it must be at least ${SHIFTS_STATION_KEY_MIN_LENGTH}. `
    + 'Use a long random value of its own, such as the output of `openssl rand -base64 32`, or leave it empty to turn station check-in off.'
}

/** Throws the {@link shiftsStationKeyIssue} of `value`, if any. */
export function assertShiftsStationKey(value: unknown): void {
  const issue = shiftsStationKeyIssue(value)
  if (issue) throw new Error(issue)
}
