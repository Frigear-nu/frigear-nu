import { describe, expect, it } from 'vitest'
import { toAdminOperationDto, toOperationDto, toOperationVenueLayoutDto } from '../../src/runtime/server/utils/operations-dto'

// A stored row, with a column the DTOs must never invent or pass on if the table grows one.
const row = {
  id: 'opr_1',
  slug: 'roskilde-2027-bar',
  name: { en: 'Roskilde 2027 bar operation', da: 'Roskilde 2027 baroperation' },
  description: null,
  hostName: 'Roskilde Festival',
  hostUrl: 'https://example.com',
  startsAt: new Date('2027-06-27T10:00:00.000Z'),
  endsAt: new Date('2027-07-04T10:00:00.000Z'),
  schedule: null,
  location: { name: 'Darupvej', point: { lat: 55.6, lng: 12.0 } },
  venueLayout: null,
  status: 'planning',
  public: true,
  eventId: null,
  createdAt: new Date('2026-11-01T08:00:00.000Z'),
  updatedAt: new Date('2026-11-02T08:00:00.000Z'),
  internalNote: 'never shown',
}

describe('operation DTOs', () => {
  it('lists exactly the allowlisted fields, dates as ISO strings', () => {
    const dto = toOperationDto(row)
    expect(Object.keys(dto).sort()).toEqual([
      'description', 'endsAt', 'eventId', 'hostName', 'hostUrl', 'id', 'location', 'name', 'public', 'schedule', 'slug', 'startsAt', 'status',
    ])
    expect(dto.startsAt).toBe('2027-06-27T10:00:00.000Z')
    expect(dto.endsAt).toBe('2027-07-04T10:00:00.000Z')
    expect(dto).not.toHaveProperty('internalNote')
  })

  it('adds only the audit dates for staff', () => {
    const dto = toAdminOperationDto(row)
    expect(Object.keys(dto).filter(key => !(key in toOperationDto(row))).sort()).toEqual(['createdAt', 'updatedAt'])
    expect(dto.createdAt).toBe('2026-11-01T08:00:00.000Z')
    expect(dto.updatedAt).toBe('2026-11-02T08:00:00.000Z')
  })

  it('turns missing optional columns into null and keeps a missing end null', () => {
    const dto = toOperationDto({ ...row, endsAt: null, hostName: null, hostUrl: null, location: null })
    expect(dto).toMatchObject({ endsAt: null, hostName: null, hostUrl: null, location: null, description: null, schedule: null, eventId: null })
  })

  it('sends the venue layout with the underlay\'s URL, never its blob pathname', () => {
    const feature = { type: 'Feature' as const, id: 'bar', kind: 'operations.station', geometry: { type: 'Point' as const, coordinates: [10, 20] as [number, number] }, properties: {} }
    const dto = toOperationVenueLayoutDto({
      slug: 'roskilde-2027-bar',
      venueLayout: { type: 'FeatureCollection', features: [feature], underlay: { pathname: 'operations/opr_1/underlay-abc.png', contentType: 'image/png', width: 800, height: 600 } },
    })
    expect(dto).toEqual({
      type: 'FeatureCollection',
      features: [feature],
      extent: null,
      underlay: { url: '/api/operations/roskilde-2027-bar/venue-layout/underlay?v=underlay-abc.png', width: 800, height: 600 },
    })
    expect(JSON.stringify(dto)).not.toContain('operations/opr_1')
    expect(toOperationVenueLayoutDto({ slug: 'x', venueLayout: null })).toEqual({ type: 'FeatureCollection', features: [], extent: null, underlay: null })
  })
})
