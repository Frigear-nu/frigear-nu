import { describe, expect, it } from 'vitest'
import { buildMapsRegistry, defaultEditorTools, providerLayersFor } from '../../src/runtime/utils/registry'
import { defineMapFeatureKind, defineMapKind, defineMapLayer, extendMaps } from '../../src/runtime/utils'
import type { MapsExtension } from '../../src/types'

const marker = defineMapFeatureKind({ id: 'maps.marker', label: 'Marker', geometry: 'Point', properties: '/abs/marker.ts' })
const area = defineMapFeatureKind({ id: 'maps.area', label: 'Area', geometry: 'Polygon' })
const label = defineMapFeatureKind({ id: 'maps.label', label: 'Label', geometry: 'Point' })
const base: MapsExtension = {
  featureKinds: [marker, area, label],
  kinds: [defineMapKind({ id: 'site', label: 'Site', base: 'geo', featureKinds: ['maps.marker', 'maps.area'] })],
}

describe('buildMapsRegistry', () => {
  it('builds kinds with defaults: view of the base, derived tools and one editable layer', () => {
    const { registry, issues } = buildMapsRegistry([base])
    expect(issues).toEqual([])
    expect(registry.kinds.site).toMatchObject({
      base: 'geo',
      ownerType: null,
      defaultView: { center: expect.any(Array), zoom: expect.any(Number) },
      editorTools: ['marker', 'polygon', 'rectangle'],
      defaultLayers: [{ key: 'features', visible: true, editable: true }],
      editPermission: null,
    })
    expect(registry.featureKinds['maps.marker']).toMatchObject({ geometry: ['Point'], hasProperties: true })
    expect(registry.propertyFiles).toEqual({ 'maps.marker': '/abs/marker.ts' })
  })

  it('lets a later definition with the same id replace an earlier one', () => {
    const { registry } = buildMapsRegistry([base, { kinds: [defineMapKind({ id: 'site', label: 'Replaced', base: 'plane', featureKinds: ['maps.area'] })] }])
    expect(registry.kinds.site).toMatchObject({ label: 'Replaced', base: 'plane', editorTools: ['polygon', 'rectangle', 'snapGrid'] })
  })

  it('reports invalid definitions', () => {
    const { issues } = buildMapsRegistry([{
      featureKinds: [defineMapFeatureKind({ id: 'bad id!', label: '', geometry: 'Circle' as never })],
      kinds: [
        defineMapKind({ id: 'k1', label: 'K', base: 'geo', featureKinds: ['missing'], editorTools: ['lasso' as never, 'snapGrid'] }),
        defineMapKind({ id: 'k2', label: 'K', base: 'globe' as never, featureKinds: [] }),
        defineMapKind({ id: 'k3', label: 'K', base: 'plane', featureKinds: [], defaultView: { center: [0, 0], zoom: 1 }, editPermission: 'nope' }),
      ],
      layers: [defineMapLayer({ key: 'l', label: 'L', appliesTo: [], provider: '', refreshInterval: 1 })],
    }])
    const text = issues.join('\n')
    expect(text).toContain('feature kind "bad id!": the id is invalid')
    expect(text).toContain('a label is required')
    expect(text).toContain('the geometry must be')
    expect(text).toContain('map kind "k1": the feature kind "missing" is not registered')
    expect(text).toContain('unknown editor tool "lasso"')
    expect(text).toContain('snapGrid is for plane maps only')
    expect(text).toContain('map kind "k2": the base must be')
    expect(text).toContain('map kind "k3": at least one feature kind is required')
    expect(text).toContain('map kind "k3": defaultView')
    expect(text).toContain('editPermission must be a permission name')
    expect(text).toContain('layer "l": appliesTo needs')
    expect(text).toContain('provider must be a server file path')
    expect(text).toContain('refreshInterval is in seconds')
  })

  it('rejects duplicate default layer keys', () => {
    const { issues } = buildMapsRegistry([{ ...base, kinds: [defineMapKind({ id: 'x', label: 'X', base: 'geo', featureKinds: ['maps.marker'], defaultLayers: [{ key: 'a', name: 'A' }, { key: 'a', name: 'B' }] })] }])
    expect(issues.join('\n')).toContain('the layer key "a" is used twice')
  })

  it('registers provider layers and finds them by kind or map key', () => {
    const { registry, issues } = buildMapsRegistry([base, { layers: [
      defineMapLayer({ key: 'duty', label: 'On duty', appliesTo: [{ kind: 'site' }, { mapKey: 'bar' }], provider: '/abs/duty.ts', permission: 'shifts:read' }),
      defineMapLayer({ key: 'other', label: 'Other', appliesTo: { mapKey: 'elsewhere' }, provider: '/abs/other.ts' }),
    ] }])
    expect(issues).toEqual([])
    expect(registry.providerFiles).toEqual({ duty: '/abs/duty.ts', other: '/abs/other.ts' })
    expect(providerLayersFor(registry.layers, { kind: 'site', key: null }).map(layer => layer.key)).toEqual(['duty'])
    expect(providerLayersFor(registry.layers, { kind: 'venue', key: 'bar' }).map(layer => layer.key)).toEqual(['duty'])
    expect(providerLayersFor(registry.layers, { kind: 'venue', key: 'elsewhere' }).map(layer => layer.key)).toEqual(['other'])
  })
})

describe('defaultEditorTools', () => {
  it('offers text only with maps.label, and the grid on plane maps', () => {
    const { registry } = buildMapsRegistry([base])
    expect(defaultEditorTools({ base: 'geo', featureKinds: ['maps.marker', 'maps.label'] }, registry.featureKinds)).toEqual(['marker', 'text'])
    expect(defaultEditorTools({ base: 'plane', featureKinds: ['maps.area'] }, registry.featureKinds)).toEqual(['polygon', 'rectangle', 'snapGrid'])
  })
})

describe('extendMaps', () => {
  it('stashes registrations on the Nuxt options for the module to read', () => {
    const nuxt = { options: {} } as Parameters<typeof extendMaps>[0]
    extendMaps(nuxt, base)
    extendMaps(nuxt, { layers: [] })
    expect((nuxt.options as { maps?: { _extensions?: unknown[] } }).maps?._extensions).toHaveLength(2)
  })
})
