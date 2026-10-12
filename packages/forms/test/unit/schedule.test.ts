import { describe, expect, it } from 'vitest'
import type { FormSchedule } from '../../src/types'
import { isFormOpen, nextFormOpening } from '../../src/runtime/utils/schedule'
import { accessSchema } from '../../src/runtime/utils/definition'

const oslo = 'Europe/Oslo'
// 1 Jan 23:00 to 1 Feb 23:00 every year (wall-clock time in Oslo; winter = UTC+1).
const january: FormSchedule = { type: 'yearly', timezone: oslo, from: { month: 1, day: 1, time: '23:00' }, to: { month: 2, day: 1, time: '23:00' } }
// Wraps over new year.
const winter: FormSchedule = { type: 'yearly', timezone: oslo, from: { month: 11, day: 1, time: '00:00' }, to: { month: 2, day: 1, time: '00:00' } }

describe('isFormOpen', () => {
  it('is open without a schedule or when always', () => {
    expect(isFormOpen(undefined)).toBe(true)
    expect(isFormOpen({ type: 'always' })).toBe(true)
  })

  it('treats a fixed range as [from, to)', () => {
    const range: FormSchedule = { type: 'range', from: '2026-03-01T10:00:00Z', to: '2026-03-02T10:00:00Z' }
    expect(isFormOpen(range, new Date('2026-03-01T09:59:00Z'))).toBe(false)
    expect(isFormOpen(range, new Date('2026-03-01T10:00:00Z'))).toBe(true)
    expect(isFormOpen(range, new Date('2026-03-02T10:00:00Z'))).toBe(false)
    expect(isFormOpen({ type: 'range', from: '2026-03-01T10:00:00Z' }, new Date('2099-01-01T00:00:00Z'))).toBe(true)
  })

  it('repeats a yearly season in the schedule timezone', () => {
    // 22:30 UTC on 31 Dec is 23:30 in Oslo on 31 Dec: still closed. 23:30 UTC is 00:30 on 1 Jan: still closed until 23:00.
    expect(isFormOpen(january, new Date('2026-12-31T23:30:00Z'))).toBe(false)
    expect(isFormOpen(january, new Date('2027-01-01T21:59:00Z'))).toBe(false)
    expect(isFormOpen(january, new Date('2027-01-01T22:00:00Z'))).toBe(true)
    expect(isFormOpen(january, new Date('2030-01-15T12:00:00Z'))).toBe(true)
    expect(isFormOpen(january, new Date('2027-02-01T21:59:00Z'))).toBe(true)
    expect(isFormOpen(january, new Date('2027-02-01T22:00:00Z'))).toBe(false)
  })

  it('wraps a season over new year', () => {
    expect(isFormOpen(winter, new Date('2026-12-24T12:00:00Z'))).toBe(true)
    expect(isFormOpen(winter, new Date('2027-01-20T12:00:00Z'))).toBe(true)
    expect(isFormOpen(winter, new Date('2027-06-01T12:00:00Z'))).toBe(false)
  })
})

describe('nextFormOpening', () => {
  it('is null when open or always', () => {
    expect(nextFormOpening(january, new Date('2027-01-15T12:00:00Z'))).toBeNull()
    expect(nextFormOpening(undefined)).toBeNull()
  })

  it('finds the next season start', () => {
    expect(nextFormOpening(january, new Date('2026-10-12T12:00:00Z'))?.toISOString()).toBe('2027-01-01T22:00:00.000Z')
  })

  it('finds an opening earlier in the day than the current time of day', () => {
    const midnight: FormSchedule = { type: 'yearly', timezone: 'UTC', from: { month: 4, day: 10, time: '00:00' }, to: { month: 4, day: 11, time: '00:00' } }
    expect(nextFormOpening(midnight, new Date('2026-10-12T18:30:00Z'))?.toISOString()).toBe('2027-04-10T00:00:00.000Z')
  })

  it('finds a fixed range start, and null once it is over', () => {
    const range: FormSchedule = { type: 'range', from: '2026-03-01T10:00:00Z', to: '2026-03-02T10:00:00Z' }
    expect(nextFormOpening(range, new Date('2026-02-01T00:00:00Z'))?.toISOString()).toBe('2026-03-01T10:00:00.000Z')
    expect(nextFormOpening(range, new Date('2026-04-01T00:00:00Z'))).toBeNull()
  })
})

describe('accessSchema schedule', () => {
  it('rejects impossible schedules', () => {
    expect(accessSchema.safeParse({ schedule: { type: 'yearly', timezone: 'Nope/Land', from: { month: 1, day: 1, time: '00:00' }, to: { month: 2, day: 1, time: '00:00' } } }).success).toBe(false)
    expect(accessSchema.safeParse({ schedule: { type: 'yearly', timezone: oslo, from: { month: 2, day: 30, time: '00:00' }, to: { month: 3, day: 1, time: '00:00' } } }).success).toBe(false)
    expect(accessSchema.safeParse({ schedule: { type: 'range', from: '2026-03-02T00:00:00Z', to: '2026-03-01T00:00:00Z' } }).success).toBe(false)
  })

  it('accepts a valid season', () => {
    expect(accessSchema.safeParse({ schedule: january }).success).toBe(true)
  })
})
