// Build-time utils and pure helpers, safe to import from another module's `setup()` (no `@nuxt/kit` import) as well as
// from the Vue app and Nitro code.
import type { Nuxt } from '@nuxt/schema'
import { translate } from '@frigear-nu/ui/translated'
import type { MapFeatureKindDefinition, MapKindDefinition, MapLayerDefinition, MapsExtension } from '../../types'

export { translate }
export * from './api'
export * from './geometry'
export * from './view'
export * from './fields'
export * from './properties'
export * from './image'
export { buildMapsRegistry, providerLayersFor, defaultEditorTools, MAPS_ID_PATTERN, DEFAULT_KIND_LAYERS } from './registry'
export type { BuiltMapsRegistry } from './registry'

export type {
  AdminMapDetailDto,
  AdminMapDto,
  AdminMapLayerDto,
  EnsureMapDefinition,
  EnsureMapFeature,
  GeoMapViewport,
  MapBase,
  MapDetailDto,
  MapDto,
  MapEditorTool,
  MapFeatureCollection,
  MapFeatureContext,
  MapFeatureDto,
  MapFeatureKindDefinition,
  MapFeatureKindInfo,
  MapFeatureUpdatedContext,
  MapGeoJsonFeature,
  MapGeometry,
  MapGeometryType,
  MapKindDefinition,
  MapKindInfo,
  MapKindLayer,
  MapLatLng,
  MapLayerAppliesTo,
  MapLayerDefinition,
  MapLayerDto,
  MapLayerInfo,
  MapPosition,
  MapProviderLayerDto,
  MapsEditResolveContext,
  MapsExtension,
  MapsSeedResolveContext,
  MapSource,
  MapSummaryDto,
  MapTilesOptions,
  MapUnderlay,
  MapUnderlayDto,
  MapViewport,
  ModuleOptions,
  PlaneMapViewport,
  Translated,
} from '../../types'

type MapsExtensions = { maps?: { _extensions?: MapsExtension[] } | false }

/** Types a map kind (for kinds kept in their own file). */
export const defineMapKind = (kind: MapKindDefinition): MapKindDefinition => kind

/** Types a feature kind. `properties` is the absolute path of a file default-exporting a zod object. */
export const defineMapFeatureKind = (kind: MapFeatureKindDefinition): MapFeatureKindDefinition => kind

/** Types a provider layer. `provider` is the absolute path of a server file default-exporting `(event, map) => FeatureCollection`. */
export const defineMapLayer = (layer: MapLayerDefinition): MapLayerDefinition => layer

/**
 * Registers map kinds, feature kinds and provider layers from a module's `setup()`. Registration order between modules
 * does not matter: maps reads them once every module is done. A definition with an id (a layer with a key) that exists
 * already replaces it, so a host can override a module's kind; an invalid definition fails the build.
 *
 * ```ts
 * import { defineMapFeatureKind, defineMapKind, extendMaps } from '@frigear-nu/maps/utils'
 *
 * extendMaps(nuxt, {
 *   featureKinds: [defineMapFeatureKind({ id: 'first-aid.post', label: 'First aid', geometry: 'Point', properties: resolver.resolve('./runtime/map/post') })],
 *   kinds: [defineMapKind({ id: 'first-aid', label: 'First aid posts', base: 'geo', featureKinds: ['first-aid.post'], editorTools: ['marker'] })],
 * })
 * ```
 */
export function extendMaps(nuxt: Nuxt, extension: MapsExtension): void {
  const options = nuxt.options as unknown as MapsExtensions
  if (options.maps === false) return
  options.maps ||= {}
  const list = options.maps._extensions ||= []
  list.push({
    kinds: [...(extension.kinds ?? [])],
    featureKinds: [...(extension.featureKinds ?? [])],
    layers: [...(extension.layers ?? [])],
  })
}

/** Random, prefixed id (`map_...`), Web Crypto only so it works on Workers. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`
}
