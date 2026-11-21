import { describe, expect, it } from 'vitest'
import { buildMapsRegistry } from '@frigear-nu/maps/utils'
import { operationMapKey, operationsMapKinds, OPERATIONS_SITE_KIND, OPERATIONS_VENUE_KIND } from '../../src/runtime/maps'

const featureKinds = ['maps.marker', 'maps.line', 'maps.area', 'maps.label']
const builtIn = {
  featureKinds: [
    { id: 'maps.marker', label: 'Marker', geometry: 'Point' as const },
    { id: 'maps.line', label: 'Line', geometry: 'LineString' as const },
    { id: 'maps.area', label: 'Area', geometry: 'Polygon' as const },
    { id: 'maps.label', label: 'Label', geometry: 'Point' as const },
  ],
}

describe('operations map kinds', () => {
  it('register against the built-in feature kinds without issues', () => {
    const { registry, issues } = buildMapsRegistry([builtIn, { kinds: operationsMapKinds }])
    expect(issues).toEqual([])
    expect(registry.kinds[OPERATIONS_SITE_KIND]).toMatchObject({ base: 'geo', ownerType: 'operation', featureKinds })
    expect(registry.kinds[OPERATIONS_VENUE_KIND]).toMatchObject({ base: 'plane', ownerType: 'operation', featureKinds })
    expect(registry.kinds[OPERATIONS_VENUE_KIND]!.editorTools).toContain('snapGrid')
    expect(registry.kinds[OPERATIONS_SITE_KIND]!.editorTools).not.toContain('snapGrid')
  })

  it('name the maps of an operation by a stable key', () => {
    expect(operationMapKey('opr_1', 'site')).toBe('operation-opr_1-site')
    expect(operationMapKey('opr_1', 'venue')).toBe('operation-opr_1-venue')
  })
})
