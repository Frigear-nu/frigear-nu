import { describe, expect, it } from 'vitest'
import { emptyTranslatedToNull, formToOperationBody, isEmptyTranslated, localToIso, toLocalInput } from '../../src/runtime/app/utils/admin-operation'
import type { OperationFormState, StaffOperation } from '../../src/runtime/app/utils/admin-operation'

const form = (overrides: Partial<OperationFormState> = {}): OperationFormState => ({
  name: 'Bar', slug: 'bar', description: undefined, hostName: '', hostUrl: '', startsAt: '2027-06-27T10:00', endsAt: '', locationName: undefined, locationAddress: '', public: false, eventId: '', ...overrides,
})

describe('operation form body', () => {
  it('sends dates as ISO instants, converted from the browser\'s local time', () => {
    const body = formToOperationBody(form({ endsAt: '2027-07-04T10:00' }))
    expect(body.startsAt).toBe(new Date(2027, 5, 27, 10, 0).toISOString())
    expect(body.endsAt).toBe(new Date(2027, 6, 4, 10, 0).toISOString())
    expect(body.startsAt).toMatch(/Z$/)
  })

  it('keeps a stored instant while the shown minute is untouched (seconds survive a save)', () => {
    const stored = new Date(2027, 5, 27, 10, 0, 42).toISOString()
    expect(localToIso(toLocalInput(stored), stored)).toBe(stored)
    expect(localToIso('2027-06-27T11:00', stored)).toBe(new Date(2027, 5, 27, 11, 0).toISOString())
    const body = formToOperationBody(form({ startsAt: toLocalInput(stored) }), { startsAt: stored, endsAt: null, location: null } as StaffOperation)
    expect(body.startsAt).toBe(stored)
  })

  it('sends a cleared translated field as null, never {}', () => {
    for (const cleared of [undefined, '', '  ', {}, { en: '', da: ' ' }]) {
      expect(isEmptyTranslated(cleared)).toBe(true)
      const body = formToOperationBody(form({ description: cleared, locationName: cleared }))
      expect(body.description, JSON.stringify(cleared)).toBeNull()
      expect(body.location, JSON.stringify(cleared)).toBeNull()
    }
    expect(emptyTranslatedToNull({ en: 'Text' })).toEqual({ en: 'Text' })
    expect(formToOperationBody(form({ locationName: { en: 'Main Street' } })).location).toEqual({ name: { en: 'Main Street' } })
  })

  it('keeps stored coordinates while the place is only renamed', () => {
    const previous = { startsAt: '2027-06-27T08:00:00.000Z', endsAt: null, location: { name: 'Old', lat: 10, lng: 20 } } as StaffOperation
    expect(formToOperationBody(form({ locationName: 'New' }), previous).location).toEqual({ name: 'New', lat: 10, lng: 20 })
  })
})
