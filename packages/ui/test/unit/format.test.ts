import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDate, formatDateRange, formatDateTime, formatTime } from '../../src/runtime/utils/format'

const ICU_SPACES = /[\u00A0\u2009\u202F]/

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

  it('returns plain spaces from the runtime ICU', () => {
    const start = '2026-10-15T10:00:00Z'
    const end = '2026-10-15T14:30:00Z'
    const options = { timeZone: 'UTC' }
    // en-US puts a narrow no-break space before AM/PM and thin spaces around range dashes in recent ICU versions.
    for (const locale of ['en', 'en-US', 'en-GB', 'da', 'fr']) {
      expect(formatTime(start, locale, options)).not.toMatch(ICU_SPACES)
      expect(formatDateTime(start, locale, options)).not.toMatch(ICU_SPACES)
      expect(formatDate(start, locale, options)).not.toMatch(ICU_SPACES)
      expect(formatDateRange(start, end, locale, { ...options, dateStyle: 'medium', timeStyle: 'short' })).not.toMatch(ICU_SPACES)
      expect(formatDateRange(start, '2026-10-17T10:00:00Z', locale, options)).not.toMatch(ICU_SPACES)
    }
    expect(formatTime(start, 'en-US', options)).toBe('10:00 AM')
  })

  it('replaces thin, narrow no-break and no-break spaces whatever the ICU version returns', () => {
    // `format` is a getter that returns a bound function.
    vi.spyOn(Intl.DateTimeFormat.prototype, 'format', 'get').mockReturnValue(() => '10:00\u202FAM\u00A0x')
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatRange').mockReturnValue('10:00\u2009–\u20092:30\u202FPM')
    const value = '2026-10-15T10:00:00Z'
    expect(formatTime(value, 'en')).toBe('10:00 AM x')
    expect(formatDate(value, 'en')).toBe('10:00 AM x')
    expect(formatDateTime(value, 'en')).toBe('10:00 AM x')
    expect(formatDateRange(value, '2026-10-15T14:30:00Z', 'en')).toBe('10:00 – 2:30 PM')
    expect(formatDateRange(value, null, 'en')).toBe('10:00 AM x')
  })
})
