import { describe, expect, it } from 'vitest'
import { addDays, clockOf, countdownParts, dayKey, isClock, isDay, shiftByDays, slotInstants, zonedTimeToUtc } from '../../src/runtime/utils/time'

const CPH = 'Europe/Copenhagen'

describe('wall-clock times in a time zone', () => {
  it('turns a local time into the instant, in summer and in winter', () => {
    expect(zonedTimeToUtc('2027-06-28', '18:00', CPH).toISOString()).toBe('2027-06-28T16:00:00.000Z')
    expect(zonedTimeToUtc('2027-01-15', '10:00', CPH).toISOString()).toBe('2027-01-15T09:00:00.000Z')
    expect(zonedTimeToUtc('2027-06-28', '18:00', 'UTC').toISOString()).toBe('2027-06-28T18:00:00.000Z')
    expect(zonedTimeToUtc('2027-06-28', '18:00', 'America/New_York').toISOString()).toBe('2027-06-28T22:00:00.000Z')
  })

  it('keeps the local time across a daylight saving change', () => {
    // 2027-03-28 is the spring change in Copenhagen: the day before is +1, the day after +2.
    expect(zonedTimeToUtc('2027-03-27', '12:00', CPH).toISOString()).toBe('2027-03-27T11:00:00.000Z')
    expect(zonedTimeToUtc('2027-03-29', '12:00', CPH).toISOString()).toBe('2027-03-29T10:00:00.000Z')
  })

  it('reads the day and clock of an instant back', () => {
    expect(dayKey('2027-06-28T22:30:00.000Z', CPH)).toBe('2027-06-29')
    expect(clockOf('2027-06-28T22:30:00.000Z', CPH)).toBe('00:30')
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01')
  })

  it('ends a night slot on the next day', () => {
    const { startsAt, endsAt } = slotInstants('2027-06-28', { start: '22:00', end: '04:00' }, CPH)
    expect(startsAt.toISOString()).toBe('2027-06-28T20:00:00.000Z')
    expect(endsAt.toISOString()).toBe('2027-06-29T02:00:00.000Z')
  })

  it('moves an instant by days at the same local time', () => {
    // A winter shift moved into summer keeps 10:00 local.
    expect(shiftByDays(new Date('2027-01-15T09:00:00.000Z'), 180, CPH).toISOString()).toBe('2027-07-14T08:00:00.000Z')
  })

  it('validates days and clocks', () => {
    expect(isDay('2027-06-28')).toBe(true)
    expect(isDay('2027-6-28')).toBe(false)
    expect(isClock('23:59')).toBe(true)
    expect(isClock('24:00')).toBe(false)
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
