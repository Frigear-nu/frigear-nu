import { describe, expect, it } from 'vitest'
import { operationInput, operationPatchSchema, operationTranslated } from '../../src/runtime/server/utils/operations-schemas'

const base = { slug: 'roskilde-2027-bar', name: 'Roskilde', startsAt: '2027-06-27T10:00:00.000Z' }

describe('operation input dates', () => {
  it('accepts ISO datetimes with an offset and keeps the instant', () => {
    const parsed = operationInput.parse({ ...base, startsAt: '2027-06-27T10:00:00+02:00', endsAt: '2027-07-04T10:00:00Z' })
    expect(parsed.startsAt.toISOString()).toBe('2027-06-27T08:00:00.000Z')
    expect(parsed.endsAt?.toISOString()).toBe('2027-07-04T10:00:00.000Z')
  })

  it('refuses offset-free strings, date-only strings, null, booleans and numbers', () => {
    for (const startsAt of ['2027-06-27T10:00', '2027-06-27', '', null, true, 0, 1_800_000_000_000]) {
      expect(operationInput.safeParse({ ...base, startsAt }).success, String(startsAt)).toBe(false)
      expect(operationPatchSchema.safeParse({ startsAt }).success, String(startsAt)).toBe(false)
    }
  })

  it('lets the end be null or omitted, but not a falsy non-date', () => {
    expect(operationInput.safeParse({ ...base, endsAt: null }).success).toBe(true)
    expect(operationPatchSchema.safeParse({ endsAt: null }).success).toBe(true)
    for (const endsAt of [true, 0, '']) expect(operationPatchSchema.safeParse({ endsAt }).success, String(endsAt)).toBe(false)
  })

  it('refuses an end before the start on create', () => {
    expect(operationInput.safeParse({ ...base, endsAt: '2027-06-01T00:00:00Z' }).success).toBe(false)
  })
})

describe('translated texts', () => {
  it('trims a plain string and refuses a blank one', () => {
    expect(operationTranslated.parse('  Bar  ')).toBe('Bar')
    expect(operationTranslated.safeParse('   ').success).toBe(false)
  })

  it('drops empty locales and refuses a map with no text', () => {
    expect(operationTranslated.parse({ en: 'Bar', da: '  ' })).toEqual({ en: 'Bar' })
    expect(operationTranslated.safeParse({}).success).toBe(false)
    expect(operationTranslated.safeParse({ en: ' ' }).success).toBe(false)
  })
})
