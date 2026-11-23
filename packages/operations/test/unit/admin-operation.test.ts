import { describe, expect, it } from 'vitest'
import { emptyTranslatedToNull, formToOperationBody, isEmptyTranslated, localToIso, operationLocationMap, operationToForm, slugify, toLocalInput } from '../../src/runtime/app/utils/admin-operation'
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
    expect(formToOperationBody(form({ locationName: { en: 'Main Street' } })).location).toEqual({ name: { en: 'Main Street' } })
  })

  it('sends the location picker\'s value with the name and address, and reads it back', () => {
    const area = [{ lat: 10.02, lng: 20.07 }, { lat: 10.02, lng: 20.09 }, { lat: 10.01, lng: 20.08 }]
    const body = formToOperationBody(form({ locationName: 'Main Street', locationAddress: ' Main Street 1 ', locationMap: { point: { lat: 10.015, lng: 20.08 }, area } }))
    expect(body.location).toEqual({ name: 'Main Street', address: 'Main Street 1', point: { lat: 10.015, lng: 20.08 }, area })
    // A place on the map alone is a location too.
    expect(formToOperationBody(form({ locationMap: { point: { lat: 10, lng: 20 }, radiusMeters: 50 } })).location)
      .toEqual({ point: { lat: 10, lng: 20 }, radiusMeters: 50 })
    const stored = { name: 'Bar', slug: 'bar', startsAt: '2027-06-27T08:00:00.000Z', endsAt: null, location: { name: 'Main Street', point: { lat: 10, lng: 20 }, radiusMeters: 50 } } as StaffOperation
    expect(operationToForm(stored).locationMap).toEqual({ point: { lat: 10, lng: 20 }, radiusMeters: 50 })
    expect(operationLocationMap({ name: 'Only a name' })).toBeNull()
  })
})

describe('slugify', () => {
  it('spells out Danish letters and drops accents', () => {
    expect(slugify('Æblefest')).toBe('aeblefest')
    expect(slugify('Øl-bar')).toBe('oel-bar')
    expect(slugify('Bar i Århus 2030')).toBe('bar-i-aarhus-2030')
    expect(slugify('Crème brûlée')).toBe('creme-brulee')
    expect(slugify('Straße')).toBe('strasse')
  })

  it('joins everything else with single dashes', () => {
    expect(slugify('  Summer -- Festival!  ')).toBe('summer-festival')
    expect(slugify('!!!')).toBe('')
  })
})
