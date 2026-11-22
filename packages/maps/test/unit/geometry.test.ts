import { describe, expect, it } from 'vitest'
import {
  geometryAnchor,
  geometryBounds,
  geometryPositions,
  planeExtentOf,
  snapGeometry,
  toLatLng,
  toolsForGeometries,
  toPosition,
  validateGeometry,
  withPlaneUnderlay,
} from '../../src/runtime/utils/geometry'
import { newFeatureId } from '../../src/runtime/utils'

describe('validateGeometry', () => {
  it('accepts points, lines and polygons and keeps only GeoJSON keys', () => {
    expect(validateGeometry({ type: 'Point', coordinates: [12, 55], extra: 1 })).toEqual({ ok: true, geometry: { type: 'Point', coordinates: [12, 55] } })
    expect(validateGeometry({ type: 'LineString', coordinates: [[0, 0], [10, 10]] })).toMatchObject({ ok: true })
    const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    expect(validateGeometry({ type: 'Polygon', coordinates: [square] })).toEqual({ ok: true, geometry: { type: 'Polygon', coordinates: [square] } })
  })

  it('closes an open polygon ring', () => {
    expect(validateGeometry({ type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10]]] }))
      .toEqual({ ok: true, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } })
  })

  it('rejects what is not a plane geometry', () => {
    expect(validateGeometry(null).ok).toBe(false)
    expect(validateGeometry({ type: 'Circle', coordinates: [0, 0] }).ok).toBe(false)
    expect(validateGeometry({ type: 'Point', coordinates: ['a', 1] }).ok).toBe(false)
    expect(validateGeometry({ type: 'Point', coordinates: [2e7, 10] }).ok).toBe(false)
    expect(validateGeometry({ type: 'LineString', coordinates: [[0, 0]] }).ok).toBe(false)
    expect(validateGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] }).ok).toBe(false)
  })

  it('narrows to the types a feature kind allows', () => {
    expect(validateGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }, ['Point']))
      .toMatchObject({ ok: false, message: expect.stringContaining('cannot be a LineString') })
  })
})

describe('anchors and bounds', () => {
  it('anchors a point as it is, a line at its middle and a polygon at its centroid', () => {
    expect(geometryAnchor({ type: 'Point', coordinates: [3, 4] })).toEqual([3, 4])
    expect(geometryAnchor({ type: 'LineString', coordinates: [[0, 0], [10, 0], [10, 10]] })).toEqual([10, 0])
    expect(geometryAnchor({ type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] })).toEqual([5, 5])
    // A degenerate polygon falls back to the mean of its corners.
    expect(geometryAnchor({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [4, 0], [0, 0]]] })).toEqual([2, 0])
    expect(geometryAnchor({ type: 'Circle' })).toBeNull()
    expect(geometryAnchor(undefined)).toBeNull()
  })

  it('finds the bounds around geometries', () => {
    expect(geometryBounds([])).toBeNull()
    expect(geometryBounds([{ type: 'Point', coordinates: [10, 20] }, { type: 'LineString', coordinates: [[0, 5], [30, 40]] }])).toEqual([[0, 5], [30, 40]])
    expect(geometryPositions({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] })).toHaveLength(4)
  })

  it('takes the extent of a layout from itself, its underlay or the default', () => {
    expect(planeExtentOf({ extent: { width: 40, height: 30 }, underlay: { url: '/x', width: 800, height: 600 } })).toEqual({ width: 40, height: 30 })
    expect(planeExtentOf({ underlay: { url: '/x', width: 800, height: 600 } })).toEqual({ width: 800, height: 600 })
    expect(planeExtentOf(null)).toEqual({ width: 1000, height: 1000 })
  })

  it('gives a layout the size of a newly uploaded underlay, so an old extent does not clip it', () => {
    const layout = { type: 'FeatureCollection' as const, features: [], extent: { width: 40, height: 30 }, underlay: null }
    const next = withPlaneUnderlay(layout, { url: '/api/x/underlay?v=2', width: 800, height: 600 })
    expect(next).toEqual({ type: 'FeatureCollection', features: [], extent: { width: 800, height: 600 }, underlay: { url: '/api/x/underlay?v=2', width: 800, height: 600 } })
    expect(planeExtentOf(next)).toEqual({ width: 800, height: 600 })
  })
})

describe('newFeatureId', () => {
  it('builds a 20 hex digit id, with crypto.randomUUID or without it (plain-http origins)', () => {
    expect(newFeatureId()).toMatch(/^ftr_[0-9a-f]{20}$/)
    const randomUUID = crypto.randomUUID
    try {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
      expect(newFeatureId('seat')).toMatch(/^seat_[0-9a-f]{20}$/)
      expect(newFeatureId()).not.toBe(newFeatureId())
    }
    finally {
      Object.defineProperty(crypto, 'randomUUID', { value: randomUUID, configurable: true })
    }
  })
})

describe('editor helpers', () => {
  it('swaps GeoJSON [x, y] and Leaflet [lat, lng]', () => {
    expect(toLatLng([12, 55])).toEqual([55, 12])
    expect(toPosition([55, 12])).toEqual([12, 55])
  })

  it('snaps to the grid and offers the tools of the geometries', () => {
    expect(snapGeometry({ type: 'Point', coordinates: [12, 18] })).toEqual({ type: 'Point', coordinates: [10, 20] })
    expect(snapGeometry({ type: 'Polygon', coordinates: [[[1, 1], [24, 2], [26, 29], [1, 1]]] }, 5))
      .toEqual({ type: 'Polygon', coordinates: [[[0, 0], [25, 0], [25, 30], [0, 0]]] })
    expect(toolsForGeometries(['Point'])).toEqual(['marker'])
    expect(toolsForGeometries(['LineString', 'Polygon'])).toEqual(['polyline', 'polygon', 'rectangle'])
  })
})
