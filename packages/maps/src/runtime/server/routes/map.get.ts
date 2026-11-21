import { createViewer } from '@frigear-nu/audience'
import { mapsAccess } from '../../access'
import { mapsApi } from '../../utils/api'
import type { MapDetailDto, MapProviderLayerDto } from '../../../types'

// One map by id or key, with the stored layers the caller may see (a layer's visibility narrows the map's), their
// features, and the provider layers that apply to it and whose permission the caller holds. Public maps for everyone.
export default defineEventHandler(async (event): Promise<MapDetailDto> => {
  const { map } = await getValidatedRouterParams(event, mapsMapParams.parse)
  const row = await getReadableMapOr404(event, map)

  const principal = await getAuth(event)
  const canManage = !!principal && await allows(event, mapsAccess.permissions.manage)
  const viewer = principal ? await resolveMapsViewer(event) : createViewer()
  const layers = (await listMapLayers(row.id)).filter(layer => canManage || mapsLayerVisibleTo(layer, viewer))
  const features = await listMapFeatures(row.id, layers.map(layer => layer.id))

  const providerLayers: MapProviderLayerDto[] = []
  for (const layer of mapsProviderLayersFor(row)) {
    if (layer.permission && !(await allows(event, layer.permission as Parameters<typeof allows>[1]))) continue
    providerLayers.push({
      key: layer.key,
      name: layer.label,
      url: mapsApi.layer(row.id, layer.key),
      visible: layer.visible,
      refreshInterval: layer.refreshInterval,
    })
  }

  return {
    map: toMapDto(row),
    layers: layers.map(toMapLayerDto),
    providerLayers,
    features: features.map(toMapFeatureDto),
    canEdit: !!principal && await allows(event, mapsAccess.permissions.edit, row),
  }
})
