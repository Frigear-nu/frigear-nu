import { describe, expect, it } from 'vitest'
import { addDays, clockOf, dayKey, isClock, isDay, isValidTimeZone, shiftByDays, zoneOffset, zonedParts, zonedTimeToUtc } from '../src/runtime/utils/time'

const BERLIN = 'Europe/Berlin'

describe('wall-clock times in a time zone', () => {
  it('turns a local time into the instant, in summer and in winter', () => {
    expect(zonedTimeToUtc('2027-06-28', '18:00', BERLIN).toISOString()).toBe('2027-06-28T16:00:00.000Z')
    expect(zonedTimeToUtc('2027-01-15', '10:00', BERLIN).toISOString()).toBe('2027-01-15T09:00:00.000Z')
    expect(zonedTimeToUtc('2027-06-28', '18:00', 'UTC').toISOString()).toBe('2027-06-28T18:00:00.000Z')
    expect(zonedTimeToUtc('2027-06-28', '18:00', 'America/New_York').toISOString()).toBe('2027-06-28T22:00:00.000Z')
  })

  it('keeps the local time across a daylight saving change', () => {
    // 2027-03-28 is the spring change in Berlin: the day before is +1, the day after +2.
    expect(zonedTimeToUtc('2027-03-27', '12:00', BERLIN).toISOString()).toBe('2027-03-27T11:00:00.000Z')
    expect(zonedTimeToUtc('2027-03-29', '12:00', BERLIN).toISOString()).toBe('2027-03-29T10:00:00.000Z')
  })

  it('throws on a malformed day or time', () => {
    expect(() => zonedTimeToUtc('2027-6-28', '18:00', BERLIN)).toThrow()
    expect(() => zonedTimeToUtc('2027-06-28', '25:00', BERLIN)).toThrow()
  })

  it('reads the parts, offset, day and clock of an instant', () => {
    expect(zonedParts(Date.UTC(2027, 5, 28, 22, 30, 15), BERLIN)).toEqual({ year: 2027, month: 6, day: 29, hour: 0, minute: 30, second: 15 })
    expect(zoneOffset(Date.UTC(2027, 5, 28), BERLIN)).toBe(2 * 3_600_000)
    expect(zoneOffset(Date.UTC(2027, 0, 15), BERLIN)).toBe(3_600_000)
    expect(dayKey('2027-06-28T22:30:00.000Z', BERLIN)).toBe('2027-06-29')
    expect(clockOf('2027-06-28T22:30:00.000Z', BERLIN)).toBe('00:30')
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('moves an instant by days at the same local time', () => {
    // A winter shift moved into summer keeps 10:00 local.
    expect(shiftByDays(new Date('2027-01-15T09:00:00.000Z'), 180, BERLIN).toISOString()).toBe('2027-07-14T08:00:00.000Z')
    expect(shiftByDays(new Date('2027-01-15T09:00:00.000Z'), 0, BERLIN).toISOString()).toBe('2027-01-15T09:00:00.000Z')
  })

  it('validates days, clocks and time zones', () => {
    expect(isDay('2027-06-28')).toBe(true)
    expect(isDay('2027-6-28')).toBe(false)
    expect(isClock('23:59')).toBe(true)
    expect(isClock('24:00')).toBe(false)
    expect(isValidTimeZone('Europe/Berlin')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })
})
