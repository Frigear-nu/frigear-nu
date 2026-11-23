import { afterEach, describe, expect, it, vi } from 'vitest'
import { appTimeZoneOf, formatDate, formatDateRange, formatDateTime, formatTime } from '../../src/runtime/utils/format'

// The spaces ICU versions disagree on: the formatters return U+00A0 instead.
const SPECIAL_SPACES = /[\u2009\u202F]/

describe('format helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('formats in the given locale and time zone', () => {
    const value = '2026-10-15T10:00:00Z'
    expect(formatDate(value, 'en', { timeZone: 'UTC' })).toBe('Oct 15, 2026')
    expect(formatTime(value, 'en-GB', { timeZone: 'UTC' })).toBe('10:00')
    expect(formatDateTime(value, 'en-GB', { timeZone: 'UTC' })).toBe('15 Oct 2026, 10:00')
  })

  it('formats empty and invalid values as an empty string', () => {
    expect(formatDate(null)).toBe('')
    expect(formatTime('')).toBe('')
    expect(formatDateTime('not a date')).toBe('')
    expect(formatDateRange(undefined, undefined)).toBe('')
  })

  it('falls back to one end when the range is incomplete or reversed', () => {
    const options = { timeZone: 'UTC' }
    expect(formatDateRange('2026-10-15T10:00:00Z', null, 'en-GB', options)).toBe('15 Oct 2026')
    expect(formatDateRange(null, '2026-10-17T10:00:00Z', 'en-GB', options)).toBe('17 Oct 2026')
    expect(formatDateRange('2026-10-17T10:00:00Z', '2026-10-15T10:00:00Z', 'en-GB', options)).toBe('17 Oct 2026')
  })

  it('puts no-break spaces where the runtime ICU puts special ones', () => {
    const start = '2026-10-15T10:00:00Z'
    const end = '2026-10-15T14:30:00Z'
    const options = { timeZone: 'UTC' }
    // en-US puts a narrow no-break space before AM/PM and thin spaces around range dashes in recent ICU versions.
    for (const locale of ['en', 'en-US', 'en-GB', 'da', 'fr']) {
      expect(formatTime(start, locale, options)).not.toMatch(SPECIAL_SPACES)
      expect(formatDateTime(start, locale, options)).not.toMatch(SPECIAL_SPACES)
      expect(formatDate(start, locale, options)).not.toMatch(SPECIAL_SPACES)
      expect(formatDateRange(start, end, locale, { ...options, dateStyle: 'medium', timeStyle: 'short' })).not.toMatch(SPECIAL_SPACES)
      expect(formatDateRange(start, '2026-10-17T10:00:00Z', locale, options)).not.toMatch(SPECIAL_SPACES)
    }
    expect(formatTime(start, 'en-US', options)).toBe('10:00\u00A0AM')
    expect(formatDateRange(start, '2026-10-17T10:00:00Z', 'en', options)).toBe('Oct 15\u00A0–\u00A017, 2026')
    // Word spaces stay plain.
    expect(formatDate(start, 'en-GB', options)).toBe('15 Oct 2026')
  })

  it('gives the same text whichever space the ICU version puts before AM/PM or around a range dash', () => {
    const value = '2026-10-15T10:00:00Z'
    const period = (space: string) => [
      { type: 'hour', value: '10' }, { type: 'literal', value: ':' }, { type: 'minute', value: '00' },
      { type: 'literal', value: space }, { type: 'dayPeriod', value: 'AM' },
    ] as Intl.DateTimeFormatPart[]
    const range = (space: string) => [
      { type: 'hour', value: '10', source: 'startRange' }, { type: 'literal', value: `${space}–${space}`, source: 'shared' },
      { type: 'hour', value: '2', source: 'endRange' }, { type: 'literal', value: space, source: 'endRange' },
      { type: 'dayPeriod', value: 'PM', source: 'endRange' },
    ] as Intl.DateTimeRangeFormatPart[]
    for (const space of [' ', '\u00A0', '\u2009', '\u202F']) {
      vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue(period(space))
      vi.spyOn(Intl.DateTimeFormat.prototype, 'formatRangeToParts').mockReturnValue(range(space))
      expect(formatTime(value, 'en')).toBe('10:00\u00A0AM')
      expect(formatDate(value, 'en')).toBe('10:00\u00A0AM')
      expect(formatDateTime(value, 'en')).toBe('10:00\u00A0AM')
      expect(formatDateRange(value, '2026-10-15T14:30:00Z', 'en')).toBe('10\u00A0–\u00A02\u00A0PM')
      expect(formatDateRange(value, null, 'en')).toBe('10:00\u00A0AM')
      vi.restoreAllMocks()
    }
  })
})

describe('appTimeZoneOf', () => {
  it('reads appConfig.frigearUi.timeZone, or nothing', () => {
    expect(appTimeZoneOf({ frigearUi: { timeZone: 'Asia/Tokyo' } })).toBe('Asia/Tokyo')
    expect(appTimeZoneOf({ frigearUi: { timeZone: '' } })).toBeUndefined()
    expect(appTimeZoneOf({ frigearUi: {} })).toBeUndefined()
    expect(appTimeZoneOf({})).toBeUndefined()
    expect(appTimeZoneOf(undefined)).toBeUndefined()
  })

  it('drops a zone Intl does not know, with one development warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(appTimeZoneOf({ frigearUi: { timeZone: 'Europe/Copenhagn' } })).toBeUndefined()
    expect(appTimeZoneOf({ frigearUi: { timeZone: 'Europe/Copenhagn' } })).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/"Europe\/Copenhagn" is not a valid IANA time zone/))
    // The formatters keep working with what it returns.
    const timeZone = appTimeZoneOf({ frigearUi: { timeZone: 'Europe/Copenhagn' } })
    expect(formatTime('2026-10-15T10:00:00Z', 'en-GB', timeZone ? { timeZone } : {})).toMatch(/^\d\d:00$/)
    warn.mockRestore()
  })
})
