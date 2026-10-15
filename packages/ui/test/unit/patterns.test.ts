import { describe, expect, it } from 'vitest'
import {
  errorMessage,
  errorToToast,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatTime,
  isExternalPath,
  statusColor,
  stripLocale,
  tableUi,
  nextTableSort,
  tablePageRange,
  tableSortQuery,
} from '../../src/runtime/utils'

describe('errorMessage', () => {
  it('prefers the server message of a fetch error', () => {
    expect(errorMessage({ statusMessage: 'Bad Request', data: { message: 'Email already in use' } }, 'x')).toBe('Email already in use')
    expect(errorMessage({ data: { statusMessage: 'Token expired' } }, 'x')).toBe('Token expired')
    expect(errorMessage({ response: { _data: { message: 'From response' } } }, 'x')).toBe('From response')
  })

  it('falls back to statusMessage, then message', () => {
    expect(errorMessage({ statusMessage: 'Forbidden', message: '[GET] /api: 403' }, 'x')).toBe('Forbidden')
    expect(errorMessage(new Error('Boom'), 'x')).toBe('Boom')
    expect(errorMessage('Plain text', 'x')).toBe('Plain text')
  })

  it('returns the fallback when nothing useful is set', () => {
    expect(errorMessage(undefined, 'Fallback')).toBe('Fallback')
    expect(errorMessage({ data: 'not an object', message: '  ' }, 'Fallback')).toBe('Fallback')
    expect(errorMessage(42, 'Fallback')).toBe('Fallback')
  })

  it('builds an error toast with overrides', () => {
    expect(errorToToast(new Error('Boom'))).toMatchObject({ description: 'Boom', color: 'error' })
    expect(errorToToast({}, { title: 'Could not save' })).toEqual({ title: 'Could not save', color: 'error', icon: 'i-lucide-circle-alert' })
  })
})

describe('stripLocale', () => {
  const codes = ['en', 'da']

  it('removes a known locale prefix and trailing slashes', () => {
    expect(stripLocale('/da/admin/', codes)).toBe('/admin')
    expect(stripLocale('/en', codes)).toBe('/')
    expect(stripLocale('/en/', codes)).toBe('/')
    expect(stripLocale('/admin/users?tab=overview#top', codes)).toBe('/admin/users')
  })

  it('keeps paths without a known prefix', () => {
    expect(stripLocale('/', codes)).toBe('/')
    expect(stripLocale('/de/admin', codes)).toBe('/de/admin')
    expect(stripLocale('/danish', codes)).toBe('/danish')
    expect(stripLocale('/da/admin', [])).toBe('/da/admin')
  })

  it('recognises external targets', () => {
    expect(isExternalPath('https://example.com')).toBe(true)
    expect(isExternalPath('mailto:a@example.com')).toBe(true)
    expect(isExternalPath('//cdn.example.com')).toBe(true)
    expect(isExternalPath('/admin')).toBe(false)
  })
})

describe('date formatting', () => {
  const utc = { timeZone: 'UTC' }
  const value = '2026-10-15T10:30:00Z'

  it('formats dates, date-times and times in the given locale', () => {
    expect(formatDate(value, 'en-GB', utc)).toBe('15 Oct 2026')
    expect(formatDateTime(value, 'en-GB', utc)).toBe('15 Oct 2026, 10:30')
    expect(formatTime(value, 'en-GB', utc)).toBe('10:30')
    expect(formatDate(new Date(value), 'da', utc)).toBe('15. okt. 2026')
  })

  it('formats empty and invalid values as an empty string', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('')).toBe('')
    expect(formatDateTime('not a date')).toBe('')
  })

  it('collapses shared parts of a range', () => {
    // ICU versions differ in the (thin) spaces around the dash.
    expect(formatDateRange('2026-10-15T10:00:00Z', '2026-10-17T10:00:00Z', 'en-GB', utc)).toMatch(/^15\s*–\s*17 Oct 2026$/)
    expect(formatDateRange(value, null, 'en-GB', utc)).toBe('15 Oct 2026')
    expect(formatDateRange(null, value, 'en-GB', utc)).toBe('15 Oct 2026')
    expect(formatDateRange(null, null)).toBe('')
  })
})

describe('statusColor', () => {
  it('maps known statuses', () => {
    for (const status of ['published', 'active', 'trialing', 'paid', 'succeeded']) expect(statusColor(status)).toBe('success')
    for (const status of ['pending', 'past_due', 'incomplete', 'scheduled']) expect(statusColor(status)).toBe('warning')
    expect(statusColor('failed')).toBe('error')
    expect(statusColor('PUBLISHED')).toBe('success')
  })

  it('falls back to neutral and honours overrides', () => {
    expect(statusColor('draft')).toBe('neutral')
    expect(statusColor(undefined)).toBe('neutral')
    expect(statusColor('draft', { draft: 'warning' })).toBe('warning')
    expect(statusColor('published', { published: 'info' })).toBe('info')
  })
})

describe('tableUi', () => {
  const defaults = { th: 'text-muted text-xs font-normal py-2', td: 'max-md:py-3 md:py-2', tr: 'cursor-pointer' }

  it('merges overrides into the defaults', () => {
    expect(tableUi()).toEqual(defaults)
    expect(tableUi({ tr: '' })).toEqual({ ...defaults, tr: '' })
  })

  it('lets a sticky table scroll inside its card', () => {
    expect(tableUi({}, { sticky: true })).toEqual({ root: 'max-h-[70vh]', ...defaults })
    expect(tableUi({ root: 'max-h-96' }, { sticky: true }).root).toBe('max-h-96')
  })
})

describe('table sorting', () => {
  it('cycles ascending, descending, unsorted', () => {
    const asc = nextTableSort(null, 'name')
    expect(asc).toEqual({ id: 'name', desc: false })
    const desc = nextTableSort(asc, 'name')
    expect(desc).toEqual({ id: 'name', desc: true })
    expect(nextTableSort(desc, 'name')).toBeNull()
  })

  it('starts ascending on another column', () => {
    expect(nextTableSort({ id: 'name', desc: true }, 'email')).toEqual({ id: 'email', desc: false })
  })

  it('turns the sort into a server query', () => {
    expect(tableSortQuery({ id: 'createdAt', desc: true })).toEqual({ sort: 'createdAt', order: 'desc' })
    expect(tableSortQuery({ id: 'name', desc: false })).toEqual({ sort: 'name', order: 'asc' })
    expect(tableSortQuery(null)).toEqual({ sort: undefined, order: undefined })
  })
})

describe('tablePageRange', () => {
  it('returns the rows shown on a page', () => {
    expect(tablePageRange(1, 20, 132)).toEqual({ from: 1, to: 20 })
    expect(tablePageRange(2, 20, 132)).toEqual({ from: 21, to: 40 })
    expect(tablePageRange(7, 20, 132)).toEqual({ from: 121, to: 132 })
  })

  it('is empty without rows or past the last page', () => {
    expect(tablePageRange(1, 20, 0)).toEqual({ from: 0, to: 0 })
    expect(tablePageRange(9, 20, 132)).toEqual({ from: 0, to: 0 })
  })
})
