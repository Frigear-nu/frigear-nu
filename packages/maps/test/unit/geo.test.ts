import { describe, expect, it } from 'vitest'
import { areaCentroid, geoBounds, haversineMeters, isGeoPoint, isInLocation, isInsideArea, isWithinRadius, locationBounds } from '../../src/runtime/utils/geo'

const site = { lat: 10.5, lng: 20.25 }
const town = { lat: 10.75, lng: 20.5 }
const square = [
  { lat: 10.02, lng: 20.07 },
  { lat: 10.02, lng: 20.09 },
  { lat: 10.01, lng: 20.09 },
  { lat: 10.01, lng: 20.07 },
]

describe('distances', () => {
  it('measures great-circle distances in metres', () => {
    expect(haversineMeters(site, site)).toBe(0)
    // The site to the town is about 39 km as the crow flies.
    expect(haversineMeters(site, town)).toBeGreaterThan(38_500)
    expect(haversineMeters(site, town)).toBeLessThan(39_100)
    // One degree of latitude is about 111.2 km.
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2)
  })

  it('checks a radius', () => {
    const nearby = { lat: site.lat + 0.0005, lng: site.lng }
    expect(isWithinRadius(nearby, site, 100)).toBe(true)
    expect(isWithinRadius(nearby, site, 40)).toBe(false)
  })

  it('validates points', () => {
    expect(isGeoPoint(site)).toBe(true)
    expect(isGeoPoint({ lat: 91, lng: 0 })).toBe(false)
    expect(isGeoPoint({ lat: '1', lng: 0 })).toBe(false)
    expect(isGeoPoint(null)).toBe(false)
  })
})

describe('locations', () => {
  it('knows whether a point is inside an area', () => {
    expect(isInsideArea({ lat: 10.015, lng: 20.08 }, square)).toBe(true)
    expect(isInsideArea({ lat: 10.03, lng: 20.08 }, square)).toBe(false)
    expect(isInsideArea({ lat: 10.015, lng: 20.08 }, square.slice(0, 2))).toBe(false)
  })

  it('checks a point against a location of each kind', () => {
    const inside = { lat: 10.015, lng: 20.08 }
    expect(isInLocation(inside, { point: areaCentroid(square), area: square })).toBe(true)
    expect(isInLocation(site, { point: site })).toBe(true)
    expect(isInLocation({ lat: site.lat + 0.0005, lng: site.lng }, { point: site })).toBe(false)
    expect(isInLocation({ lat: site.lat + 0.0005, lng: site.lng }, { point: site }, 100)).toBe(true)
    expect(isInLocation({ lat: site.lat + 0.0005, lng: site.lng }, { point: site, radiusMeters: 100 })).toBe(true)
  })

  it('finds the centroid of an area and the bounds of a location', () => {
    const centroid = areaCentroid(square)
    expect(centroid.lat).toBeCloseTo(10.015, 6)
    expect(centroid.lng).toBeCloseTo(20.08, 6)
    expect(locationBounds({ point: centroid, area: square })).toEqual([[10.01, 20.07], [10.02, 20.09]])
    const [[south, west], [north, east]] = locationBounds({ point: site, radiusMeters: 1000 })
    expect(haversineMeters({ lat: south, lng: site.lng }, { lat: north, lng: site.lng })).toBeCloseTo(2000, -1)
    expect(east - site.lng).toBeCloseTo(site.lng - west, 9)
    expect(geoBounds([])).toBeNull()
  })
})
