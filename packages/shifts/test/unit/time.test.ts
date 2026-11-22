import { describe, expect, it } from 'vitest'
import { countdownParts, resolveShiftsTimeZone, slotInstants } from '../../src/runtime/utils/time'

// A zone behind UTC, so a night slot also crosses the UTC date.
const ZONE = 'America/New_York'

describe('resolveShiftsTimeZone', () => {
  it('takes the shifts override, then the app time zone, then UTC', () => {
    const app = { frigearUi: { timeZone: 'Asia/Tokyo' } }
    expect(resolveShiftsTimeZone('America/New_York', app)).toBe('America/New_York')
    expect(resolveShiftsTimeZone('', app)).toBe('Asia/Tokyo')
    expect(resolveShiftsTimeZone(undefined, app)).toBe('Asia/Tokyo')
    expect(resolveShiftsTimeZone(undefined, {})).toBe('UTC')
  })
})

describe('bulk slots', () => {
  it('ends a night slot on the next day', () => {
    const { startsAt, endsAt } = slotInstants('2027-06-28', { start: '22:00', end: '04:00' }, ZONE)
    // New York is on daylight saving time (UTC-4) in June.
    expect(startsAt.toISOString()).toBe('2027-06-29T02:00:00.000Z')
    expect(endsAt.toISOString()).toBe('2027-06-29T08:00:00.000Z')
  })
})

describe('countdown', () => {
  it('splits a span into days, hours and minutes, rounding up to the next minute', () => {
    expect(countdownParts(0)).toEqual({ days: 0, hours: 0, minutes: 0 })
    expect(countdownParts(-5000)).toEqual({ days: 0, hours: 0, minutes: 0 })
    expect(countdownParts(1)).toEqual({ days: 0, hours: 0, minutes: 1 })
    expect(countdownParts(61_000)).toEqual({ days: 0, hours: 0, minutes: 2 })
    expect(countdownParts((26 * 60 + 5) * 60_000)).toEqual({ days: 1, hours: 2, minutes: 5 })
  })
})
