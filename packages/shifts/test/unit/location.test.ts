import { describe, expect, it } from 'vitest'
import { geometryAnchor } from '../../src/runtime/utils/location'

describe('geometryAnchor', () => {
  it('keeps a point where it is', () => {
    expect(geometryAnchor({ type: 'Point', coordinates: [12.08, 55.62] })).toEqual([12.08, 55.62])
  })

  it('puts a polygon at its centroid, not at the mean of its corners', () => {
    expect(geometryAnchor({ type: 'Polygon', coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] })).toEqual([50, 50])
    // An L shape: the centroid is the area's, so it differs from the mean of the six corners (1, 1).
    const [x, y] = geometryAnchor({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]] })!
    expect(x).toBeCloseTo(5 / 6)
    expect(y).toBeCloseTo(5 / 6)
  })

  it('does not depend on the winding of the ring', () => {
    expect(geometryAnchor({ type: 'Polygon', coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]] })).toEqual([5, 5])
  })

  it('falls back to the mean of the corners for a ring without area', () => {
    expect(geometryAnchor({ type: 'Polygon', coordinates: [[[0, 0], [4, 0], [8, 0], [0, 0]]] })).toEqual([4, 0])
  })

  it('puts a line halfway along its length', () => {
    expect(geometryAnchor({ type: 'LineString', coordinates: [[0, 0], [10, 0], [10, 10]] })).toEqual([10, 0])
    expect(geometryAnchor({ type: 'LineString', coordinates: [[0, 0], [4, 0]] })).toEqual([2, 0])
  })

  it('answers null for anything maps does not store', () => {
    expect(geometryAnchor(null)).toBeNull()
    expect(geometryAnchor({ type: 'MultiPoint', coordinates: [[0, 0]] })).toBeNull()
    expect(geometryAnchor({ type: 'Point', coordinates: ['x', 1] })).toBeNull()
    expect(geometryAnchor({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })).toBeNull()
  })
})
