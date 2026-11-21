import { describe, expect, it } from 'vitest'
import { boundsOfGeometries, defaultViewFor, isGeoView, isPlaneView, planeBoundsFor, snapGeometry, toLatLng, toPosition, viewIssue } from '../../src/runtime/utils/view'

describe('views', () => {
  it('has a default per base', () => {
    expect(isGeoView(defaultViewFor('geo'))).toBe(true)
    expect(isPlaneView(defaultViewFor('plane'))).toBe(true)
  })

  it('checks a view against its base', () => {
    expect(viewIssue('geo', { center: [55.6, 12.1], zoom: 14 })).toBeNull()
    expect(viewIssue('geo', { center: [95, 12], zoom: 14 })).toContain('latitude')
    expect(viewIssue('geo', { center: [55, 12], zoom: 30 })).toContain('zoom')
    expect(viewIssue('geo', { bounds: [[0, 0], [1, 1]] })).not.toBeNull()
    expect(viewIssue('plane', { bounds: [[0, 0], [600, 800]] })).toBeNull()
    expect(viewIssue('plane', { bounds: [[0, 0], [0, 800]] })).toContain('above and right')
    expect(viewIssue('plane', { center: [0, 0], zoom: 1 })).not.toBeNull()
  })

  it('places an image of width x height at the origin', () => {
    expect(planeBoundsFor(800, 600)).toEqual([[0, 0], [600, 800]])
  })
})

describe('coordinates', () => {
  it('swaps GeoJSON [x, y] and Leaflet [lat, lng]', () => {
    expect(toLatLng([12, 55])).toEqual([55, 12])
    expect(toPosition([55, 12])).toEqual([12, 55])
  })

  it('finds the bounds around geometries in Leaflet order', () => {
    expect(boundsOfGeometries([])).toBeNull()
    expect(boundsOfGeometries([
      { type: 'Point', coordinates: [10, 20] },
      { type: 'LineString', coordinates: [[0, 5], [30, 40]] },
    ])).toEqual([[5, 0], [40, 30]])
  })

  it('snaps plane geometries to the grid', () => {
    expect(snapGeometry({ type: 'Point', coordinates: [12, 18] })).toEqual({ type: 'Point', coordinates: [10, 20] })
    expect(snapGeometry({ type: 'Polygon', coordinates: [[[1, 1], [24, 2], [26, 29], [1, 1]]] }, 5))
      .toEqual({ type: 'Polygon', coordinates: [[[0, 0], [25, 0], [25, 30], [0, 0]]] })
  })
})
