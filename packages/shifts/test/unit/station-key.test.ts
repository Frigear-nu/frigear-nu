import { describe, expect, it } from 'vitest'
import { SHIFTS_STATION_KEY_MIN_LENGTH, assertShiftsStationKey, shiftsStationKeyIssue } from '../../src/runtime/utils/station-key'

describe('station key length', () => {
  it('accepts no key (station check-in off) and a key of at least 32 characters', () => {
    expect(SHIFTS_STATION_KEY_MIN_LENGTH).toBe(32)
    for (const value of [undefined, null, '', '   ', 'x'.repeat(32), 'a-test-only-station-key-at-least-32-chars']) {
      expect(shiftsStationKeyIssue(value)).toBeUndefined()
      expect(() => assertShiftsStationKey(value)).not.toThrow()
    }
  })

  it('refuses a shorter key with a clear error, counting the trimmed length', () => {
    expect(() => assertShiftsStationKey('short')).toThrow(/NUXT_SHIFTS_STATION_KEY .* is 5 characters long; it must be at least 32/)
    expect(() => assertShiftsStationKey(`  ${'x'.repeat(31)}  `)).toThrow(/is 31 characters long/)
    expect(() => assertShiftsStationKey(12345)).toThrow(/must be a string/)
  })
})
