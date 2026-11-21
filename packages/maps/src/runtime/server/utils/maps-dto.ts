import type { schema } from '@nuxthub/db'
import { isoDate } from '@frigear-nu/module-kit/server'
import { parseVisibility } from '@frigear-nu/audience'
import { mapsApi } from '../../utils/api'
import type {
  AdminMapDto,
  AdminMapLayerDto,
  MapBase,
  MapDto,
  MapFeatureDto,
  MapLayerDto,
  MapSource,
  MapSummaryDto,
  MapUnderlayDto,
  Translated,
} from '../../../types'

type MapRow = typeof schema.maps.$inferSelect
type MapLayerRow = typeof schema.mapLayers.$inferSelect
type MapFeatureRow = typeof schema.mapFeatures.$inferSelect

/** A short, stable version of the underlay for its URL, so a replaced image is fetched again. */
function underlayVersion(pathname: string): string {
  let hash = 0
  for (let index = 0; index < pathname.length; index++) hash = (hash * 31 + pathname.charCodeAt(index)) | 0
  return (hash >>> 0).toString(36)
}

/** Where clients load the underlay and where they place it; the blob pathname stays on the server. */
export function toMapUnderlayDto(row: Pick<MapRow, 'id' | 'underlay'>): MapUnderlayDto | null {
  const underlay = row.underlay
  if (!underlay?.pathname) return null
  return {
    url: `${mapsApi.underlay(row.id)}?v=${underlayVersion(underlay.pathname)}`,
    width: underlay.width,
    height: underlay.height,
    bounds: underlay.bounds,
  }
}

/** A map in lists: who owns it and what it is called. */
export function toMapSummaryDto(row: MapRow): MapSummaryDto {
  return {
    id: row.id,
    key: row.key ?? null,
    kind: row.kind,
    base: row.base as MapBase,
    ownerType: row.ownerType,
    ownerId: row.ownerId ?? null,
    name: row.name,
  }
}

/** A map as anybody who may read it sees it: no visibility rules, no audit dates. */
export function toMapDto(row: MapRow): MapDto {
  return {
    ...toMapSummaryDto(row),
    view: row.view,
    underlay: toMapUnderlayDto(row),
    public: parseVisibility(row.visibility)?.public === true,
  }
}

/** The staff view: the visibility, where the map came from and the audit dates. */
export function toAdminMapDto(row: MapRow, ownerLabel: Translated | null = null): AdminMapDto {
  return {
    ...toMapDto(row),
    source: row.source as MapSource,
    visibility: parseVisibility(row.visibility),
    ownerLabel,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}

export function toMapLayerDto(row: MapLayerRow): MapLayerDto {
  return {
    id: row.id,
    mapId: row.mapId,
    key: row.key,
    name: row.name,
    sort: row.sort,
    visible: row.visible,
    editable: row.editable,
  }
}

export function toAdminMapLayerDto(row: MapLayerRow): AdminMapLayerDto {
  return { ...toMapLayerDto(row), visibility: parseVisibility(row.visibility) }
}

export function toMapFeatureDto(row: MapFeatureRow): MapFeatureDto {
  return {
    id: row.id,
    mapId: row.mapId,
    layerId: row.layerId,
    featureKind: row.featureKind,
    geometry: row.geometry,
    properties: row.properties ?? {},
    label: row.label ?? null,
    linkMapId: row.linkMapId ?? null,
    sort: row.sort,
    createdAt: isoDate(row.createdAt),
    updatedAt: isoDate(row.updatedAt),
  }
}
