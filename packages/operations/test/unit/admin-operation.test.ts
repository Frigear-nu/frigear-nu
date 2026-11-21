import { describe, expect, it } from 'vitest'
import { emptyTranslatedToNull, formToOperationBody, isEmptyTranslated, localToIso, operationLocationMap, operationToForm, toLocalInput } from '../../src/runtime/app/utils/admin-operation'
import type { OperationFormState, StaffOperation } from '../../src/runtime/app/utils/admin-operation'

const form = (overrides: Partial<OperationFormState> = {}): OperationFormState => ({
  name: 'Bar', slug: 'bar', description: undefined, hostName: '', hostUrl: '', startsAt: '2027-06-27T10:00', endsAt: '', locationName: undefined, locationAddress: '', locationMap: null, public: false, eventId: '', ...overrides,
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
    expect(formToOperationBody(form({ locationName: { en: 'Darupvej' } })).location).toEqual({ name: { en: 'Darupvej' } })
  })

  it('sends the location picker\'s value with the name and address, and reads it back', () => {
    const area = [{ lat: 55.62, lng: 12.07 }, { lat: 55.62, lng: 12.09 }, { lat: 55.61, lng: 12.08 }]
    const body = formToOperationBody(form({ locationName: 'Darupvej', locationAddress: ' Darupvej 1 ', locationMap: { point: { lat: 55.615, lng: 12.08 }, area } }))
    expect(body.location).toEqual({ name: 'Darupvej', address: 'Darupvej 1', point: { lat: 55.615, lng: 12.08 }, area })
    // A place on the map alone is a location too.
    expect(formToOperationBody(form({ locationMap: { point: { lat: 55.6, lng: 12 }, radiusMeters: 50 } })).location)
      .toEqual({ point: { lat: 55.6, lng: 12 }, radiusMeters: 50 })
    const stored = { name: 'Bar', slug: 'bar', startsAt: '2027-06-27T08:00:00.000Z', endsAt: null, location: { name: 'Darupvej', point: { lat: 55.6, lng: 12 }, radiusMeters: 50 } } as StaffOperation
    expect(operationToForm(stored).locationMap).toEqual({ point: { lat: 55.6, lng: 12 }, radiusMeters: 50 })
    expect(operationLocationMap({ name: 'Only a name' })).toBeNull()
  })
})
