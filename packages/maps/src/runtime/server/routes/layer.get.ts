import { notFound } from '@frigear-nu/module-kit/server'
import type { MapFeatureCollection } from '../../../types'

// The live GeoJSON of a provider layer of a map: the map must be readable, the layer must apply to it (by kind or key),
// and the caller must hold the layer's permission (401/403 otherwise). Never cached: providers answer per request.
export default defineEventHandler(async (event): Promise<MapFeatureCollection> => {
  const { map, layerKey } = await getValidatedRouterParams(event, mapsLayerKeyParams.parse)
  const row = await getReadableMapOr404(event, map)
  const layer = mapsProviderLayersFor(row).find(candidate => candidate.key === layerKey)
  if (!layer) throw notFound('Layer not found.')
  if (layer.permission) await authorize(event, layer.permission as Parameters<typeof authorize>[1])
  setResponseHeader(event, 'cache-control', 'no-store')
  return mapsRunProvider(event, row, layer)
})
