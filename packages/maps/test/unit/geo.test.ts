import { describe, expect, it } from 'vitest'
import { areaCentroid, geoBounds, haversineMeters, isGeoPoint, isInLocation, isInsideArea, isWithinRadius, locationBounds } from '../../src/runtime/utils/geo'

const roskilde = { lat: 55.6415, lng: 12.0803 }
const copenhagen = { lat: 55.6761, lng: 12.5683 }
const square = [
  { lat: 55.62, lng: 12.07 },
  { lat: 55.62, lng: 12.09 },
  { lat: 55.61, lng: 12.09 },
  { lat: 55.61, lng: 12.07 },
]

describe('distances', () => {
  it('measures great-circle distances in metres', () => {
    expect(haversineMeters(roskilde, roskilde)).toBe(0)
    // Roskilde to Copenhagen is about 30.9 km as the crow flies.
    expect(haversineMeters(roskilde, copenhagen)).toBeGreaterThan(30_500)
    expect(haversineMeters(roskilde, copenhagen)).toBeLessThan(31_300)
    // One degree of latitude is about 111.2 km.
    expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -2)
  })

  it('checks a radius', () => {
    const nearby = { lat: roskilde.lat + 0.0005, lng: roskilde.lng }
    expect(isWithinRadius(nearby, roskilde, 100)).toBe(true)
    expect(isWithinRadius(nearby, roskilde, 40)).toBe(false)
  })

  it('validates points', () => {
    expect(isGeoPoint(roskilde)).toBe(true)
    expect(isGeoPoint({ lat: 91, lng: 0 })).toBe(false)
    expect(isGeoPoint({ lat: '1', lng: 0 })).toBe(false)
    expect(isGeoPoint(null)).toBe(false)
  })
})

describe('locations', () => {
  it('knows whether a point is inside an area', () => {
    expect(isInsideArea({ lat: 55.615, lng: 12.08 }, square)).toBe(true)
    expect(isInsideArea({ lat: 55.63, lng: 12.08 }, square)).toBe(false)
    expect(isInsideArea({ lat: 55.615, lng: 12.08 }, square.slice(0, 2))).toBe(false)
  })

  it('checks a point against a location of each kind', () => {
    const inside = { lat: 55.615, lng: 12.08 }
    expect(isInLocation(inside, { point: areaCentroid(square), area: square })).toBe(true)
    expect(isInLocation(roskilde, { point: roskilde })).toBe(true)
    expect(isInLocation({ lat: roskilde.lat + 0.0005, lng: roskilde.lng }, { point: roskilde })).toBe(false)
    expect(isInLocation({ lat: roskilde.lat + 0.0005, lng: roskilde.lng }, { point: roskilde }, 100)).toBe(true)
    expect(isInLocation({ lat: roskilde.lat + 0.0005, lng: roskilde.lng }, { point: roskilde, radiusMeters: 100 })).toBe(true)
  })

  it('finds the centroid of an area and the bounds of a location', () => {
    const centroid = areaCentroid(square)
    expect(centroid.lat).toBeCloseTo(55.615, 6)
    expect(centroid.lng).toBeCloseTo(12.08, 6)
    expect(locationBounds({ point: centroid, area: square })).toEqual([[55.61, 12.07], [55.62, 12.09]])
    const [[south, west], [north, east]] = locationBounds({ point: roskilde, radiusMeters: 1000 })
    expect(haversineMeters({ lat: south, lng: roskilde.lng }, { lat: north, lng: roskilde.lng })).toBeCloseTo(2000, -1)
    expect(east - roskilde.lng).toBeCloseTo(roskilde.lng - west, 9)
    expect(geoBounds([])).toBeNull()
  })
})
