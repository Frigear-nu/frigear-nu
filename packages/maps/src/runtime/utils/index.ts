// Build-time utils and pure helpers, safe to import from another module's `setup()` (no `@nuxt/kit` import) as well as
// from the Vue app and Nitro code.
import type { Nuxt } from '@nuxt/schema'
import { translate } from '@frigear-nu/ui/translated'
import type { MapFeatureKindDefinition, MapLayerDefinition, MapsExtension } from '../../types'

export { translate }
export * from './geo'
export * from './geometry'
export * from './fields'
export * from './properties'
export * from './image'
export { buildMapsRegistry, layersForSurface, layerUrl, MAPS_ID_PATTERN, MIN_REFRESH_INTERVAL } from './registry'
export type { BuiltMapsRegistry } from './registry'

export type {
  GeoPoint,
  MapFeatureKindDefinition,
  MapFeatureKindInfo,
  MapGeometryType,
  MapLayerDefinition,
  MapLayerInfo,
  MapLiveFeature,
  MapLiveFeatureCollection,
  MapLocation,
  MapLocationMode,
  MapsExtension,
  MapSelection,
  MapViewerLocation,
  MapTilesOptions,
  ModuleOptions,
  PlaneExtent,
  PlaneFeature,
  PlaneFeatureCollection,
  PlaneGeometry,
  PlaneLineStringGeometry,
  PlanePointGeometry,
  PlanePolygonGeometry,
  PlanePosition,
  PlaneUnderlay,
  Translated,
} from '../../types'

type MapsExtensions = { maps?: { _extensions?: MapsExtension[] } | false }

/** Types a feature kind. `properties` is the absolute path of a file default-exporting a zod object. */
export const defineMapFeatureKind = (kind: MapFeatureKindDefinition): MapFeatureKindDefinition => kind

/** Types a live layer. `endpoint` is the module's own route, with `:params` the viewer fills. */
export const defineMapLayer = (layer: MapLayerDefinition): MapLayerDefinition => layer

/**
 * Registers feature kinds and live layers from a module's `setup()`. Registration order between modules does not
 * matter: maps reads them once every module is done. A definition with an id that exists already replaces it, so a
 * host can override a module's kind; an invalid definition fails the build.
 *
 * ```ts
 * import { defineMapFeatureKind, extendMaps } from '@frigear-nu/maps/utils'
 *
 * extendMaps(nuxt, {
 *   kinds: [defineMapFeatureKind({ id: 'seating.seat', label: 'Seat', geometry: 'Point', properties: resolver.resolve('./runtime/maps/seat') })],
 * })
 * ```
 */
export function extendMaps(nuxt: Nuxt, extension: MapsExtension): void {
  const options = nuxt.options as unknown as MapsExtensions
  if (options.maps === false) return
  options.maps ||= {}
  const list = options.maps._extensions ||= []
  list.push({ kinds: [...(extension.kinds ?? [])], layers: [...(extension.layers ?? [])] })
}

/** A random, prefixed id for a new feature (`ftr_...`), Web Crypto only so it works on Workers and in the browser. */
export function newFeatureId(prefix = 'ftr'): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 20)}`
}
