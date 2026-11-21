import { describe, expect, it } from 'vitest'
import { validatePlaneLayout } from '../../src/runtime/server/utils/maps-layout'

const seat = (id: string, properties: Record<string, unknown>) => ({ id, kind: 'seating.seat', geometry: { type: 'Point', coordinates: [10, 20] }, properties })

describe('validatePlaneLayout', () => {
  it('parses every feature with its kind\'s properties schema', () => {
    const check = validatePlaneLayout({ features: [seat('a1', { row: 'A', number: 1 })] })
    expect(check).toEqual({
      success: true,
      data: { type: 'FeatureCollection', features: [{ type: 'Feature', ...seat('a1', { row: 'A', number: 1, accessible: false }) }] },
    })
  })

  it('reports invalid properties, unknown kinds and shapes a kind may not have, with paths', () => {
    const check = validatePlaneLayout({
      features: [
        seat('a1', { row: 'A', number: 0 }),
        { id: 'x', kind: 'nobody.knows', geometry: { type: 'Point', coordinates: [0, 0] } },
        { id: 'bar', kind: 'maps.area', geometry: { type: 'Point', coordinates: [0, 0] } },
      ],
    })
    expect(check.success).toBe(false)
    expect(check.success ? [] : check.issues.map(issue => issue.path.join('.'))).toEqual([
      'features.0.properties.number',
      'features.1.kind',
      'features.2.geometry',
    ])
  })

  it('passes the shape options on', () => {
    const check = validatePlaneLayout({ features: [seat('a1', { row: 'A', number: 1 })] }, { kinds: ['maps.area'] })
    expect(check.success).toBe(false)
  })
})
