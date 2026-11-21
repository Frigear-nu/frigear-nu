import { describe, expect, it } from 'vitest'
import { buildMapsRegistry, layersForSurface, layerUrl } from '../../src/runtime/utils/registry'
import { defineMapFeatureKind, defineMapLayer, extendMaps } from '../../src/runtime/utils'
import type { MapsExtension } from '../../src/types'

const marker = defineMapFeatureKind({ id: 'maps.marker', label: 'Marker', geometry: 'Point', properties: '/abs/marker.ts' })
const station = defineMapFeatureKind({ id: 'operations.station', label: { da: 'Station', en: 'Station' }, geometry: ['Point', 'Polygon', 'Point'], component: '/abs/Station.vue' })
const onDuty = defineMapLayer({
  id: 'shifts.on-duty',
  label: 'On duty',
  appliesTo: 'operations.venue-layout',
  endpoint: '/api/shifts/operations/:operationId/on-duty',
  permission: 'shifts:read',
  refreshInterval: 120,
})

describe('buildMapsRegistry', () => {
  it('builds feature kinds and layers with their defaults', () => {
    const { registry, issues } = buildMapsRegistry([{ kinds: [marker, station], layers: [onDuty] }])
    expect(issues).toEqual([])
    expect(registry.kinds['operations.station']).toMatchObject({ geometry: ['Point', 'Polygon'], hasProperties: false, hasComponent: true, icon: null })
    expect(registry.propertyFiles).toEqual({ 'maps.marker': '/abs/marker.ts' })
    expect(registry.kindComponents).toEqual({ 'operations.station': '/abs/Station.vue' })
    expect(registry.layers['shifts.on-duty']).toEqual({
      id: 'shifts.on-duty',
      label: 'On duty',
      appliesTo: ['operations.venue-layout'],
      endpoint: '/api/shifts/operations/:operationId/on-duty',
      refreshInterval: 120,
      permission: 'shifts:read',
      visible: true,
      color: null,
    })
  })

  it('lets a later definition with the same id replace an earlier one', () => {
    const { registry } = buildMapsRegistry([{ kinds: [marker] }, { kinds: [{ ...marker, label: 'Pin', properties: undefined }] }])
    expect(registry.kinds['maps.marker']).toMatchObject({ label: 'Pin', hasProperties: false })
    expect(registry.propertyFiles).toEqual({})
  })

  it('reports every invalid registration', () => {
    const { issues } = buildMapsRegistry([{
      kinds: [
        { id: 'bad id!', label: 'x', geometry: 'Point' },
        { id: 'no-label', label: '', geometry: 'Point' },
        { id: 'circle', label: 'Circle', geometry: 'Circle' as never },
      ],
      layers: [
        { ...onDuty, id: 'no-surface', appliesTo: [] },
        { ...onDuty, id: 'external', endpoint: 'https://example.com/x' },
        { ...onDuty, id: 'protocol-relative', endpoint: '//example.com/x' },
        { ...onDuty, id: 'too-often', refreshInterval: 1 },
        { ...onDuty, id: 'bad-permission', permission: 'read' },
      ],
    }])
    expect(issues).toEqual([
      expect.stringContaining('feature kind "bad id!": the id is invalid'),
      expect.stringContaining('feature kind "no-label": a label is required'),
      expect.stringContaining('feature kind "circle": the geometry must be'),
      expect.stringContaining('layer "no-surface": appliesTo'),
      expect.stringContaining('layer "external": endpoint'),
      expect.stringContaining('layer "protocol-relative": endpoint'),
      expect.stringContaining('layer "too-often": refreshInterval'),
      expect.stringContaining('layer "bad-permission": permission'),
    ])
  })
})

describe('live layers', () => {
  const { registry } = buildMapsRegistry([{ layers: [onDuty, { ...onDuty, id: 'other', appliesTo: ['teams.area'] }] }])

  it('picks the layers of a surface', () => {
    expect(layersForSurface(registry.layers, 'operations.venue-layout').map(layer => layer.id)).toEqual(['shifts.on-duty'])
    expect(layersForSurface(registry.layers, 'operations.venue-layout', ['other'])).toEqual([])
    expect(layersForSurface(registry.layers, undefined)).toEqual([])
  })

  it('fills endpoint params, encoded, and skips a layer with one missing', () => {
    expect(layerUrl('/api/shifts/operations/:operationId/on-duty', { operationId: 'opr 1/2' })).toBe('/api/shifts/operations/opr%201%2F2/on-duty')
    expect(layerUrl('/api/x/:a/:b', { a: 1 })).toBeNull()
    expect(layerUrl('/api/x/:a', { a: '' })).toBeNull()
    expect(layerUrl('/api/static')).toBe('/api/static')
  })
})

describe('extendMaps', () => {
  it('stashes registrations on the nuxt options, unless maps is turned off', () => {
    const nuxt = { options: {} } as unknown as Parameters<typeof extendMaps>[0]
    extendMaps(nuxt, { kinds: [marker] })
    extendMaps(nuxt, { layers: [onDuty] })
    expect((nuxt.options as unknown as { maps: { _extensions: MapsExtension[] } }).maps._extensions).toEqual([
      { kinds: [marker], layers: [] },
      { kinds: [], layers: [onDuty] },
    ])
    const off = { options: { maps: false } } as unknown as Parameters<typeof extendMaps>[0]
    extendMaps(off, { kinds: [marker] })
    expect((off.options as unknown as { maps: unknown }).maps).toBe(false)
  })
})
