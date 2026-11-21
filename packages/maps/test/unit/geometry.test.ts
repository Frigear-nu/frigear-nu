import { describe, expect, it } from 'vitest'
import { geometryPositions, toolsForGeometries, validateGeometry } from '../../src/runtime/utils/geometry'

describe('validateGeometry', () => {
  it('accepts points, lines and polygons and keeps only GeoJSON keys', () => {
    expect(validateGeometry({ type: 'Point', coordinates: [12.08, 55.62], extra: 1 }, 'geo')).toEqual({ ok: true, geometry: { type: 'Point', coordinates: [12.08, 55.62] } })
    expect(validateGeometry({ type: 'LineString', coordinates: [[0, 0], [10, 10]] }, 'plane')).toMatchObject({ ok: true })
    const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]
    expect(validateGeometry({ type: 'Polygon', coordinates: [square] }, 'plane')).toEqual({ ok: true, geometry: { type: 'Polygon', coordinates: [square] } })
  })

  it('closes an open polygon ring', () => {
    const result = validateGeometry({ type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10]]] }, 'plane')
    expect(result).toEqual({ ok: true, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } })
  })

  it('rejects what is not valid GeoJSON for the base', () => {
    expect(validateGeometry(null, 'geo').ok).toBe(false)
    expect(validateGeometry({ type: 'Circle', coordinates: [0, 0] }, 'geo').ok).toBe(false)
    expect(validateGeometry({ type: 'Point', coordinates: ['a', 1] }, 'geo').ok).toBe(false)
    expect(validateGeometry({ type: 'Point', coordinates: [200, 10] }, 'geo').ok).toBe(false)
    expect(validateGeometry({ type: 'Point', coordinates: [200, 10] }, 'plane').ok).toBe(true)
    expect(validateGeometry({ type: 'LineString', coordinates: [[0, 0]] }, 'plane').ok).toBe(false)
    expect(validateGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] }, 'plane').ok).toBe(false)
  })

  it('narrows to the types a feature kind allows', () => {
    const result = validateGeometry({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }, 'plane', ['Point'])
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('cannot be a LineString') })
  })
})

describe('geometry helpers', () => {
  it('lists positions and the tools that draw each type', () => {
    expect(geometryPositions({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] })).toHaveLength(4)
    expect(toolsForGeometries(['Point'])).toEqual(['marker', 'text'])
    expect(toolsForGeometries(['LineString', 'Polygon'])).toEqual(['polyline', 'polygon', 'rectangle'])
  })
})
