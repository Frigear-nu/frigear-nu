import { featureKinds, kinds, layers, propertySchemas, providers } from '#maps/server-registry'
import type { MapsProvider, MapsPropertySchema } from '#maps/server-registry'
import { providerLayersFor } from '../../utils/registry'
import type { MapFeatureKindInfo, MapKindInfo, MapLayerInfo } from '../../../types'

// The registry built at build time from every `extendMaps` call (`#maps/server-registry`), for the server.

/** A registered map kind, or `undefined`. */
export function mapsKind(id: string): MapKindInfo | undefined {
  return Object.hasOwn(kinds, id) ? kinds[id] : undefined
}

/** Every registered map kind. */
export function mapsKinds(): MapKindInfo[] {
  return Object.values(kinds)
}

/** A registered feature kind, or `undefined`. */
export function mapsFeatureKind(id: string): MapFeatureKindInfo | undefined {
  return Object.hasOwn(featureKinds, id) ? featureKinds[id] : undefined
}

/** The zod schema of a feature kind's properties, or `undefined` when it has none. */
export function mapsPropertySchema(id: string): MapsPropertySchema | undefined {
  return Object.hasOwn(propertySchemas, id) ? propertySchemas[id] : undefined
}

/** A registered provider layer, or `undefined`. */
export function mapsProviderLayer(key: string): MapLayerInfo | undefined {
  return Object.hasOwn(layers, key) ? layers[key] : undefined
}

/** The provider function of a layer, or `undefined`. */
export function mapsProvider(key: string): MapsProvider | undefined {
  return Object.hasOwn(providers, key) ? providers[key] : undefined
}

/** The provider layers that apply to a map, by its kind or its key. */
export function mapsProviderLayersFor(map: { kind: string, key: string | null }): MapLayerInfo[] {
  return providerLayersFor(layers, map)
}
