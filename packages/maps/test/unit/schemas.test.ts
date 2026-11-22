import { describe, expect, it } from 'vitest'
import { isSameAppPath } from '../../src/runtime/utils/image'
import { emptyPlaneLayout, mapLocationSchema, planeFeatureCollectionSchema, planeLayoutSchema } from '../../src/runtime/schemas'

describe('mapLocationSchema', () => {
  it('accepts a point, a point with a radius and an area, and drops extra keys', () => {
    expect(mapLocationSchema.parse({ point: { lat: 10.0, lng: 20.1 }, extra: true })).toEqual({ point: { lat: 10.0, lng: 20.1 } })
    expect(mapLocationSchema.parse({ point: { lat: 10.0, lng: 20.1 }, radiusMeters: 150 })).toMatchObject({ radiusMeters: 150 })
    const area = [{ lat: 10.0, lng: 20.1 }, { lat: 10.01, lng: 20.1 }, { lat: 10.01, lng: 20.11 }]
    expect(mapLocationSchema.parse({ point: { lat: 10.005, lng: 20.105 }, area })).toMatchObject({ area })
  })

  it('refuses out-of-range points, both a radius and an area, and too small areas', () => {
    expect(mapLocationSchema.safeParse({ point: { lat: 91, lng: 0 } }).success).toBe(false)
    expect(mapLocationSchema.safeParse({ point: { lat: 1, lng: 2 }, radiusMeters: 0 }).success).toBe(false)
    expect(mapLocationSchema.safeParse({ point: { lat: 1, lng: 2 }, area: [{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }] }).success).toBe(false)
    const both = mapLocationSchema.safeParse({ point: { lat: 1, lng: 2 }, radiusMeters: 5, area: [{ lat: 1, lng: 2 }, { lat: 1, lng: 3 }, { lat: 2, lng: 3 }] })
    expect(both.success).toBe(false)
  })
})

describe('planeFeatureCollectionSchema', () => {
  const seat = (id: string) => ({ id, kind: 'seating.seat', geometry: { type: 'Point', coordinates: [10, 20] }, properties: { row: 'A' } })

  it('fills the GeoJSON type keys and normalises geometries', () => {
    const parsed = planeLayoutSchema.parse({
      features: [{ id: 'bar', kind: 'maps.area', geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10]]] } }],
      underlay: { url: '/api/x/underlay?v=1', width: 800, height: 600 },
    })
    expect(parsed).toEqual({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', id: 'bar', kind: 'maps.area', geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] }, properties: {} }],
      underlay: { url: '/api/x/underlay?v=1', width: 800, height: 600 },
    })
    expect(planeLayoutSchema.parse(emptyPlaneLayout())).toEqual({ type: 'FeatureCollection', features: [] })
  })

  it('refuses duplicate ids, unsafe ids, kinds that are not allowed and too many features', () => {
    const duplicate = planeLayoutSchema.safeParse({ features: [seat('a1'), seat('a1')] })
    expect(duplicate.success).toBe(false)
    expect(duplicate.error?.issues[0]?.path).toEqual(['features', 1, 'id'])
    expect(planeLayoutSchema.safeParse({ features: [seat('a 1')] }).success).toBe(false)
    const narrowed = planeFeatureCollectionSchema({ kinds: ['operations.station'] }).safeParse({ features: [seat('a1')] })
    expect(narrowed.error?.issues[0]?.path).toEqual(['features', 0, 'kind'])
    expect(planeFeatureCollectionSchema({ maxFeatures: 1 }).safeParse({ features: [seat('a1'), seat('a2')] }).success).toBe(false)
    expect(planeLayoutSchema.safeParse({ features: [{ ...seat('a1'), geometry: { type: 'Point', coordinates: ['x', 1] } }] }).success).toBe(false)
  })
})

describe('underlay url', () => {
  it('accepts only a path on this app', () => {
    for (const url of ['/api/operations/fest/venue-layout/underlay?v=underlay-abc.png', '/api/demo/underlay/venue%2Fx.png']) {
      expect(isSameAppPath(url)).toBe(true)
    }
    for (const url of ['https://tracker.example/x.png', '//tracker.example/x.png', '/\\tracker.example/x.png', '/\ttracker', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'x.png', '', 42]) {
      expect(isSameAppPath(url)).toBe(false)
    }
  })

  it('refuses a layout whose underlay is an external image', () => {
    const external = planeLayoutSchema.safeParse({ features: [], underlay: { url: 'https://tracker.example/x.png', width: 800, height: 600 } })
    expect(external.success).toBe(false)
    expect(external.error?.issues[0]?.path).toEqual(['underlay', 'url'])
    expect(planeLayoutSchema.safeParse({ features: [], underlay: { url: '//tracker.example/x.png', width: 800, height: 600 } }).success).toBe(false)
  })
})
