import { describe, expect, it } from 'vitest'
import { haversineMeters } from '../../src/runtime/utils/geo'
import { bearingDegrees, extentCorners, geoToPlane, gridOf, initialGeoreference, isPlacedLayout, layoutToGeo, normalizeRotation, placeGeoreference, placedCenter, planeLengthInMetres, planeToGeo, underlayModeOf, underlayOpacityOf } from '../../src/runtime/utils/georeference'
import { planeLayoutSchema, planePlacementSchema } from '../../src/runtime/schemas'
import type { PlaneFeatureCollection, PlaneGeoreference } from '../../src/types'

const site = { lat: 10.5, lng: 20.25 }
const north: PlaneGeoreference = { origin: site, rotation: 0, metersPerUnit: 1 }

describe('georeference', () => {
  it('places plane units in metres from the origin', () => {
    const [lng, lat] = planeToGeo([0, 100], north)
    expect(haversineMeters(site, { lat, lng })).toBeCloseTo(100, 1)
    expect(lng).toBeCloseTo(site.lng, 9)
    const [eastLng, eastLat] = planeToGeo([100, 0], north)
    expect(eastLat).toBeCloseTo(site.lat, 9)
    expect(haversineMeters(site, { lat: eastLat, lng: eastLng })).toBeCloseTo(100, 1)
  })

  it('turns the plane clockwise and scales it', () => {
    const [lng, lat] = planeToGeo([0, 50], { ...north, rotation: 90, metersPerUnit: 2 })
    // +y now points east, 50 units of 2 m.
    expect(lat).toBeCloseTo(site.lat, 9)
    expect(haversineMeters(site, { lat, lng })).toBeCloseTo(100, 1)
    expect(bearingDegrees(site, { lat, lng })).toBeCloseTo(90, 3)
  })

  it('round-trips plane to geo and back', () => {
    const placed = { origin: site, rotation: -37.5, metersPerUnit: 0.25 }
    for (const position of [[0, 0], [123.4, -56.7], [1000, 800]] as const) {
      const back = geoToPlane(planeToGeo(position, placed), placed)
      expect(back[0]).toBeCloseTo(position[0], 6)
      expect(back[1]).toBeCloseTo(position[1], 6)
    }
  })

  it('places a plane centred on a point', () => {
    const extent = { width: 400, height: 200 }
    const placed = initialGeoreference(extent, site, 200)
    expect(placed.metersPerUnit).toBeCloseTo(0.5)
    expect(haversineMeters(placedCenter({ extent }, placed), site)).toBeLessThan(0.01)
    const corners = extentCorners(extent, placed)
    expect(haversineMeters(corners[0], corners[1])).toBeCloseTo(200, 0)
    const turned = placeGeoreference(extent, site, 450, 1)
    expect(turned.rotation).toBe(90)
    expect(haversineMeters(placedCenter({ extent }, turned), site)).toBeLessThan(0.01)
  })

  it('normalises rotations', () => {
    expect(normalizeRotation(270)).toBe(-90)
    expect(normalizeRotation(-190)).toBe(170)
    expect(normalizeRotation(180)).toBe(180)
  })

  it('turns a placed layout into a geo layout', () => {
    const layout: PlaneFeatureCollection = { type: 'FeatureCollection', features: [{ type: 'Feature', id: 'a', kind: 'maps.marker', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }] }
    expect(isPlacedLayout(layout)).toBe(false)
    expect(layoutToGeo(layout)).toBeNull()
    const geo = layoutToGeo(layout, { georeference: north })!
    expect(isPlacedLayout(layout, { georeference: north })).toBe(true)
    expect(geo.crs).toBe('geo')
    expect(geo.features[0]!.geometry).toEqual({ type: 'Point', coordinates: [site.lng, site.lat] })
    expect(layoutToGeo(geo)).toBe(geo)
  })

  it('picks one underlay and its opacity', () => {
    const image = { url: '/a.png', width: 10, height: 10 }
    expect(underlayModeOf({}, null)).toBe('none')
    expect(underlayModeOf({ underlay: image }, null)).toBe('image')
    expect(underlayModeOf({ underlay: image }, { underlayMode: 'tiles' })).toBe('image')
    expect(underlayModeOf({}, { underlayMode: 'tiles', georeference: north })).toBe('tiles')
    expect(underlayModeOf({ underlay: image }, { underlayMode: 'none' })).toBe('none')
    expect(underlayOpacityOf({ underlayOpacity: 0 })).toBe(0.1)
    expect(underlayOpacityOf(null)).toBe(1)
  })

  it('snaps to metres once placed', () => {
    expect(gridOf(null, 10)).toEqual({ unit: 'plane', size: 10, planeUnits: 10 })
    expect(gridOf({ gridUnit: 'metres', gridSize: 0.5 }, 10)).toEqual({ unit: 'plane', size: 10, planeUnits: 10 })
    expect(gridOf({ gridUnit: 'metres', gridSize: 0.5, georeference: { ...north, metersPerUnit: 0.05 } }, 10)).toEqual({ unit: 'metres', size: 0.5, planeUnits: 10 })
    expect(planeLengthInMetres(200, { georeference: { ...north, metersPerUnit: 0.05 } })).toBeCloseTo(10)
    expect(planeLengthInMetres(200, null)).toBeNull()
  })
})

describe('schemas', () => {
  it('keeps a placement and the underlay choice', () => {
    const parsed = planePlacementSchema.parse({ georeference: { origin: site, rotation: 370, metersPerUnit: 0.5 }, underlayMode: 'tiles', underlayOpacity: 0.6, gridUnit: 'metres', gridSize: 1 })
    expect(parsed.georeference).toEqual({ origin: site, rotation: 10, metersPerUnit: 0.5 })
    expect(parsed).toMatchObject({ underlayMode: 'tiles', underlayOpacity: 0.6, gridUnit: 'metres', gridSize: 1 })
  })

  it('refuses tiles or metres without a placement, and a bad scale', () => {
    expect(planePlacementSchema.safeParse({ underlayMode: 'tiles' }).success).toBe(false)
    expect(planePlacementSchema.safeParse({ gridUnit: 'metres' }).success).toBe(false)
    expect(planePlacementSchema.safeParse({ georeference: { origin: site, rotation: 0, metersPerUnit: 0 } }).success).toBe(false)
    expect(planePlacementSchema.safeParse({ underlayOpacity: 2 }).success).toBe(false)
  })

  it('checks a geo layout', () => {
    const point = (coordinates: [number, number]) => ({ features: [{ id: 'a', kind: 'maps.marker', geometry: { type: 'Point', coordinates } }], crs: 'geo' })
    expect(planeLayoutSchema.safeParse(point([20.25, 10.5])).success).toBe(true)
    expect(planeLayoutSchema.safeParse(point([500, 10])).success).toBe(false)
    expect(planeLayoutSchema.safeParse({ ...point([20, 10]), extent: { width: 10, height: 10 } }).success).toBe(false)
  })
})
