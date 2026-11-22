import { describe, expect, it } from 'vitest'
import { addDays, clockOf, dayKey, isClock, isDay, isValidTimeZone, shiftByDays, zoneOffset, zonedParts, zonedTimeToUtc } from '../src/runtime/utils/time'

const BERLIN = 'Europe/Berlin'
const NEW_YORK = 'America/New_York'

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

  // Each case: local day and time, the instant it is, and the wall time it shows back in the zone.
  const at = (day: string, clock: string, zone: string) => {
    const instant = zonedTimeToUtc(day, clock, zone)
    return [instant.toISOString(), clockOf(instant, zone)]
  }

  it('resolves times on the spring-forward day in Berlin (02:00 -> 03:00 on 2027-03-28)', () => {
    expect(at('2027-03-28', '00:30', BERLIN)).toEqual(['2027-03-27T23:30:00.000Z', '00:30'])
    expect(at('2027-03-28', '01:30', BERLIN)).toEqual(['2027-03-28T00:30:00.000Z', '01:30'])
    expect(at('2027-03-28', '01:59', BERLIN)).toEqual(['2027-03-28T00:59:00.000Z', '01:59'])
    // Inside the gap: moves forward by the hour the clocks skip.
    expect(at('2027-03-28', '02:00', BERLIN)).toEqual(['2027-03-28T01:00:00.000Z', '03:00'])
    expect(at('2027-03-28', '02:30', BERLIN)).toEqual(['2027-03-28T01:30:00.000Z', '03:30'])
    expect(at('2027-03-28', '02:59', BERLIN)).toEqual(['2027-03-28T01:59:00.000Z', '03:59'])
    expect(at('2027-03-28', '03:00', BERLIN)).toEqual(['2027-03-28T01:00:00.000Z', '03:00'])
    expect(at('2027-03-28', '03:30', BERLIN)).toEqual(['2027-03-28T01:30:00.000Z', '03:30'])
    expect(at('2027-03-28', '12:00', BERLIN)).toEqual(['2027-03-28T10:00:00.000Z', '12:00'])
  })

  it('resolves times on the fall-back day in Berlin (03:00 -> 02:00 on 2027-10-31)', () => {
    expect(at('2027-10-31', '01:30', BERLIN)).toEqual(['2027-10-30T23:30:00.000Z', '01:30'])
    expect(at('2027-10-31', '01:59', BERLIN)).toEqual(['2027-10-30T23:59:00.000Z', '01:59'])
    // Inside the overlap: the earlier of the two instants (summer time).
    expect(at('2027-10-31', '02:00', BERLIN)).toEqual(['2027-10-31T00:00:00.000Z', '02:00'])
    expect(at('2027-10-31', '02:30', BERLIN)).toEqual(['2027-10-31T00:30:00.000Z', '02:30'])
    expect(at('2027-10-31', '02:59', BERLIN)).toEqual(['2027-10-31T00:59:00.000Z', '02:59'])
    expect(at('2027-10-31', '03:00', BERLIN)).toEqual(['2027-10-31T02:00:00.000Z', '03:00'])
    expect(at('2027-10-31', '03:30', BERLIN)).toEqual(['2027-10-31T02:30:00.000Z', '03:30'])
    expect(at('2027-10-31', '12:00', BERLIN)).toEqual(['2027-10-31T11:00:00.000Z', '12:00'])
  })

  it('resolves times on the spring-forward day in New York (02:00 -> 03:00 on 2027-03-14)', () => {
    expect(at('2027-03-14', '01:30', NEW_YORK)).toEqual(['2027-03-14T06:30:00.000Z', '01:30'])
    expect(at('2027-03-14', '01:59', NEW_YORK)).toEqual(['2027-03-14T06:59:00.000Z', '01:59'])
    // Inside the gap: moves forward by the hour the clocks skip.
    expect(at('2027-03-14', '02:00', NEW_YORK)).toEqual(['2027-03-14T07:00:00.000Z', '03:00'])
    expect(at('2027-03-14', '02:30', NEW_YORK)).toEqual(['2027-03-14T07:30:00.000Z', '03:30'])
    expect(at('2027-03-14', '03:00', NEW_YORK)).toEqual(['2027-03-14T07:00:00.000Z', '03:00'])
    expect(at('2027-03-14', '03:30', NEW_YORK)).toEqual(['2027-03-14T07:30:00.000Z', '03:30'])
    expect(at('2027-03-14', '22:00', NEW_YORK)).toEqual(['2027-03-15T02:00:00.000Z', '22:00'])
  })

  it('resolves times on the fall-back day in New York (02:00 -> 01:00 on 2027-11-07)', () => {
    expect(at('2027-11-07', '00:30', NEW_YORK)).toEqual(['2027-11-07T04:30:00.000Z', '00:30'])
    expect(at('2027-11-07', '00:59', NEW_YORK)).toEqual(['2027-11-07T04:59:00.000Z', '00:59'])
    // Inside the overlap: the earlier of the two instants (daylight time).
    expect(at('2027-11-07', '01:00', NEW_YORK)).toEqual(['2027-11-07T05:00:00.000Z', '01:00'])
    expect(at('2027-11-07', '01:30', NEW_YORK)).toEqual(['2027-11-07T05:30:00.000Z', '01:30'])
    expect(at('2027-11-07', '01:59', NEW_YORK)).toEqual(['2027-11-07T05:59:00.000Z', '01:59'])
    expect(at('2027-11-07', '02:00', NEW_YORK)).toEqual(['2027-11-07T07:00:00.000Z', '02:00'])
    expect(at('2027-11-07', '02:30', NEW_YORK)).toEqual(['2027-11-07T07:30:00.000Z', '02:30'])
    expect(at('2027-11-07', '03:00', NEW_YORK)).toEqual(['2027-11-07T08:00:00.000Z', '03:00'])
    expect(at('2027-11-07', '05:30', NEW_YORK)).toEqual(['2027-11-07T10:30:00.000Z', '05:30'])
    expect(at('2027-11-07', '22:00', NEW_YORK)).toEqual(['2027-11-08T03:00:00.000Z', '22:00'])
  })

  it('throws on a malformed day or time', () => {
    expect(() => zonedTimeToUtc('2027-6-28', '18:00', BERLIN)).toThrow()
    expect(() => zonedTimeToUtc('2027-06-28', '25:00', BERLIN)).toThrow()
  })

  it('throws on a day that does not exist, like on a malformed one', () => {
    expect(() => zonedTimeToUtc('2027-02-30', '18:00', BERLIN)).toThrow('Invalid day or time')
    expect(() => zonedTimeToUtc('2026-02-29', '18:00', BERLIN)).toThrow('Invalid day or time')
    expect(() => zonedTimeToUtc('2027-04-31', '18:00', BERLIN)).toThrow('Invalid day or time')
    expect(() => zonedTimeToUtc('2027-13-01', '18:00', BERLIN)).toThrow('Invalid day or time')
    expect(zonedTimeToUtc('2028-02-29', '18:00', BERLIN).toISOString()).toBe('2028-02-29T17:00:00.000Z')
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

  it('moves an instant onto and off the daylight saving change days', () => {
    const shift = (iso: string, days: number, zone: string) => {
      const instant = shiftByDays(new Date(iso), days, zone)
      return [instant.toISOString(), clockOf(instant, zone)]
    }
    // Berlin spring-forward day: 01:30 before the gap, 02:30 inside it (moves forward), 03:30 after it.
    expect(shift('2027-03-27T00:30:00.000Z', 1, BERLIN)).toEqual(['2027-03-28T00:30:00.000Z', '01:30'])
    expect(shift('2027-03-27T01:30:00.000Z', 1, BERLIN)).toEqual(['2027-03-28T01:30:00.000Z', '03:30'])
    expect(shift('2027-03-27T02:30:00.000Z', 1, BERLIN)).toEqual(['2027-03-28T01:30:00.000Z', '03:30'])
    expect(shift('2027-03-28T00:30:00.000Z', 1, BERLIN)).toEqual(['2027-03-28T23:30:00.000Z', '01:30'])
    // Berlin fall-back day: 02:30 inside the overlap takes the earlier instant; back off the day keeps the clock.
    expect(shift('2027-10-30T00:30:00.000Z', 1, BERLIN)).toEqual(['2027-10-31T00:30:00.000Z', '02:30'])
    expect(shift('2027-10-30T01:30:00.000Z', 1, BERLIN)).toEqual(['2027-10-31T02:30:00.000Z', '03:30'])
    expect(shift('2027-10-31T01:30:00.000Z', 1, BERLIN)).toEqual(['2027-11-01T01:30:00.000Z', '02:30'])
    // New York spring-forward day: 02:30 is skipped and moves forward.
    expect(shift('2027-03-13T06:30:00.000Z', 1, NEW_YORK)).toEqual(['2027-03-14T06:30:00.000Z', '01:30'])
    expect(shift('2027-03-13T07:30:00.000Z', 1, NEW_YORK)).toEqual(['2027-03-14T07:30:00.000Z', '03:30'])
    expect(shift('2027-03-13T08:30:00.000Z', 1, NEW_YORK)).toEqual(['2027-03-14T07:30:00.000Z', '03:30'])
    // New York fall-back day: 01:30 is repeated and takes the earlier instant; 02:30 to 05:30 keep their clock.
    expect(shift('2027-11-06T05:30:00.000Z', 1, NEW_YORK)).toEqual(['2027-11-07T05:30:00.000Z', '01:30'])
    expect(shift('2027-11-06T06:30:00.000Z', 1, NEW_YORK)).toEqual(['2027-11-07T07:30:00.000Z', '02:30'])
    expect(shift('2027-11-06T09:30:00.000Z', 1, NEW_YORK)).toEqual(['2027-11-07T10:30:00.000Z', '05:30'])
    expect(shift('2027-11-07T07:30:00.000Z', 1, NEW_YORK)).toEqual(['2027-11-08T07:30:00.000Z', '02:30'])
    // A year back onto the change day.
    expect(shift('2028-11-07T07:30:00.000Z', -366, NEW_YORK)).toEqual(['2027-11-07T07:30:00.000Z', '02:30'])
  })

  it('validates days, clocks and time zones', () => {
    expect(isDay('2027-06-28')).toBe(true)
    expect(isDay('2027-6-28')).toBe(false)
    expect(isDay('2027-02-30')).toBe(false)
    expect(isDay('2026-02-29')).toBe(false)
    expect(isDay('2027-04-31')).toBe(false)
    expect(isDay('2027-00-10')).toBe(false)
    expect(isDay('2027-13-01')).toBe(false)
    expect(isDay('2027-01-00')).toBe(false)
    expect(isDay('2028-02-29')).toBe(true)
    expect(isDay('2027-12-31')).toBe(true)
    expect(isClock('23:59')).toBe(true)
    expect(isClock('24:00')).toBe(false)
    expect(isValidTimeZone('Europe/Berlin')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus')).toBe(false)
  })
})
