import type { H3Event } from 'h3'
import type { Translated } from '@frigear-nu/ui/translated'
import type { OwnerRef, Visibility } from '@frigear-nu/audience'

export type { Translated, OwnerRef, Visibility }

/** `geo`: latitude/longitude on web map tiles. `plane`: a flat drawing in its own units (Leaflet `CRS.Simple`). */
export type MapBase = 'geo' | 'plane'

/** Where a map came from: made by staff in the admin, or created by a module with `ensureMap`. */
export type MapSource = 'admin' | 'code'

/** A GeoJSON geometry type a feature kind may draw. */
export type MapGeometryType = 'Point' | 'LineString' | 'Polygon'

/** The drawing tools of the editor. `text` places a label; `snapGrid` offers snapping to the grid on plane maps. */
export type MapEditorTool = 'marker' | 'polyline' | 'polygon' | 'rectangle' | 'text' | 'snapGrid'

/** A `[lat, lng]` pair on a geo map, or a `[y, x]` pair on a plane map (Leaflet's order). */
export type MapLatLng = [number, number]

/** The initial view of a geo map: the centre (`[lat, lng]`) and zoom level. */
export type GeoMapViewport = { center: MapLatLng, zoom: number }

/** The extent of a plane map in its own units: `[[0, 0], [height, width]]` (`[y, x]`, Leaflet's order). */
export type PlaneMapViewport = { bounds: [MapLatLng, MapLatLng] }

/** A map's initial view: `GeoMapViewport` on geo maps, `PlaneMapViewport` on plane maps. */
export type MapViewport = GeoMapViewport | PlaneMapViewport

/** The floor plan image under a plane map, stored in NuxtHub Blob. */
export type MapUnderlay = {
  /** The blob pathname. Never sent to clients: they get the underlay URL. */
  pathname: string
  contentType: string
  /** The image's size in pixels, as measured by the client and validated by the server. */
  width: number
  height: number
  /** Where the image is placed, in plane units (`[[0, 0], [height, width]]` by default). */
  bounds: [MapLatLng, MapLatLng]
}

/** GeoJSON position: `[x, y]` (`[lng, lat]` on geo maps, plane units on plane maps). */
export type MapPosition = [number, number]

export type MapPointGeometry = { type: 'Point', coordinates: MapPosition }
export type MapLineStringGeometry = { type: 'LineString', coordinates: MapPosition[] }
export type MapPolygonGeometry = { type: 'Polygon', coordinates: MapPosition[][] }

/** The GeoJSON geometries maps stores. */
export type MapGeometry = MapPointGeometry | MapLineStringGeometry | MapPolygonGeometry

/** A GeoJSON feature as provider layers return them. */
export type MapGeoJsonFeature = {
  type: 'Feature'
  id?: string | number
  geometry: MapGeometry
  properties?: Record<string, unknown> | null
}

/** What a provider layer returns. */
export type MapFeatureCollection = {
  type: 'FeatureCollection'
  features: MapGeoJsonFeature[]
}

// --- Registry (build time) ------------------------------------------------------------------------------------------

/** A layer every map of a kind starts with. */
export type MapKindLayer = {
  key: string
  name: Translated
  sort?: number
  /** Shown when the map opens. Defaults to `true`. */
  visible?: boolean
  /** Features can be drawn on it. Defaults to `true`. */
  editable?: boolean
  visibility?: Visibility | null
}

/** A template for maps: their base, owner type, default view, feature kinds and editor tools (`defineMapKind`). */
export type MapKindDefinition = {
  /** Unique id, prefixed with the module (`first-aid`, `operations.site`). */
  id: string
  label: Translated
  base: MapBase
  /** When set, maps of this kind must have this owner type (`operation`, `team`, `platform`, ...). */
  ownerType?: string
  /** The view new maps of this kind start with. Defaults to a view of the base. */
  defaultView?: MapViewport
  /** The feature kinds editors may draw on maps of this kind; the first one that fits a shape is the default. */
  featureKinds: string[]
  /** The editor's drawing tools. Defaults to every tool the feature kinds can use. */
  editorTools?: MapEditorTool[]
  /** The layers new maps of this kind start with. Defaults to one editable `features` layer. */
  defaultLayers?: MapKindLayer[]
  /** A permission whose holders may edit every map of this kind, besides `maps:manage`. */
  editPermission?: string
  /** A page the module ships for maps of this kind (shown as a link in the admin). `:map` is replaced by the key or id. */
  page?: string
}

/** A kind of feature: its geometry, its properties schema and how it is shown (`defineMapFeatureKind`). */
export type MapFeatureKindDefinition = {
  /** Unique id, prefixed with the module (`first-aid.post`, `maps.marker`). */
  id: string
  label: Translated
  /** An Iconify name (`i-lucide-cross`). */
  icon?: string
  /** The geometries it may have. */
  geometry: MapGeometryType | MapGeometryType[]
  /** A colour for markers, lines and areas (any CSS colour). */
  color?: string
  /**
   * Absolute path to a file default-exporting a zod object (`z.object({...})`) for the feature's `properties`. It is
   * bundled into the app (the editor builds its form from it) and into the server (which validates with it), so it
   * may only import `zod` and `@frigear-nu/maps/properties`, never `#imports`.
   */
  properties?: string
  /** Absolute path to a Vue component shown in the feature's popup (props: `feature`, `map`). */
  component?: string
}

/** Which maps a provider layer applies to: every map of a kind, or one map by key. */
export type MapLayerAppliesTo = { kind: string } | { mapKey: string }

/** A layer whose features come from a server function, such as who is on shift now (`defineMapLayer`). */
export type MapLayerDefinition = {
  /** Unique key, prefixed with the module (`shifts.on-duty`). */
  key: string
  label: Translated
  appliesTo: MapLayerAppliesTo | MapLayerAppliesTo[]
  /**
   * Absolute path to a server file default-exporting `(event, map) => MapFeatureCollection` (or a promise of one). Only
   * bundled into the server.
   */
  provider: string
  /** Absolute path to a Vue component that draws the layer instead of the default (props: `layer` with its `url`, `map`, `leaflet`). */
  component?: string
  /** A permission the caller must hold to see the layer (`shifts:read`). Checked on every request. */
  permission?: string
  /** Refetch the layer every this many seconds while the map is open. */
  refreshInterval?: number
  /** Shown when the map opens. Defaults to `true`. */
  visible?: boolean
}

/** What `extendMaps` registers. */
export type MapsExtension = {
  kinds?: MapKindDefinition[]
  featureKinds?: MapFeatureKindDefinition[]
  layers?: MapLayerDefinition[]
}

/** A map kind as the runtime registry holds it (JSON). */
export type MapKindInfo = Required<Pick<MapKindDefinition, 'id' | 'label' | 'base' | 'featureKinds' | 'editorTools' | 'defaultLayers'>>
  & { ownerType: string | null, defaultView: MapViewport, editPermission: string | null, page: string | null }

/** A feature kind as the runtime registry holds it (JSON; the schema is imported next to it). */
export type MapFeatureKindInfo = {
  id: string
  label: Translated
  icon: string | null
  geometry: MapGeometryType[]
  color: string | null
  hasProperties: boolean
  hasComponent: boolean
}

/** A provider layer as the runtime registry holds it (JSON). */
export type MapLayerInfo = {
  key: string
  label: Translated
  appliesTo: MapLayerAppliesTo[]
  permission: string | null
  refreshInterval: number | null
  visible: boolean
  hasComponent: boolean
}

// --- Module options ---------------------------------------------------------------------------------------------------

/** The tile server of geo maps. Defaults to OpenStreetMap's, which forbids heavy use: see the docs. */
export type MapTilesOptions = {
  url: string
  attribution: string
  maxZoom?: number
}

export type ModuleOptions = {
  /** The geo maps' tile layer. Defaults to OpenStreetMap's public tiles (fine for development and light use only). */
  tiles?: MapTilesOptions
  /** Kinds, feature kinds and layers of the host, the same as `extendMaps` from a module. */
  kinds?: MapKindDefinition[]
  featureKinds?: MapFeatureKindDefinition[]
  layers?: MapLayerDefinition[]
  settings?: {
    /** The largest underlay image in bytes. Defaults to 10 MB. */
    maxUnderlayBytes?: number
    pages?: {
      /** The read-only map page; must contain a `:map` param (key or id). On by default (`/maps/:map`), `false` turns it off. */
      view?: string | boolean
      /** Staff map list (needs `maps:manage`). `true` = `/admin/maps`. Off by default. */
      admin?: string | boolean
      /** Staff map page with the editor; must contain an `:id` param. `true` = `/admin/maps/:id`. Off by default. */
      adminMap?: string | boolean
    }
    /** Adds a "Maps" tab to the staff operation page when widget and admin are installed. Defaults to `true`. */
    operationsTab?: boolean
  }
}

export type PublicModuleOptions = {
  pages: { view?: string, admin?: string, adminMap?: string }
  tiles: Required<MapTilesOptions>
  maxUnderlayBytes: number
}

// --- DTOs ---------------------------------------------------------------------------------------------------------------

/** The underlay as clients see it: where to load the image and where to place it. */
export type MapUnderlayDto = {
  url: string
  width: number
  height: number
  bounds: [MapLatLng, MapLatLng]
}

/** A map in lists (`GET /api/maps`). */
export type MapSummaryDto = {
  id: string
  key: string | null
  kind: string
  base: MapBase
  ownerType: string
  ownerId: string | null
  name: Translated
}

/** A map as anybody who may read it sees it. */
export type MapDto = MapSummaryDto & {
  view: MapViewport
  underlay: MapUnderlayDto | null
  /** `public: true` maps show to everyone; the rest is decided per viewer. */
  public: boolean
}

/** A stored layer. */
export type MapLayerDto = {
  id: string
  mapId: string
  key: string
  name: Translated
  sort: number
  visible: boolean
  editable: boolean
}

/** A layer whose features come from a provider: fetch them from `url`. */
export type MapProviderLayerDto = {
  key: string
  name: Translated
  url: string
  visible: boolean
  refreshInterval: number | null
}

/** A stored feature. */
export type MapFeatureDto = {
  id: string
  mapId: string
  layerId: string
  featureKind: string
  geometry: MapGeometry
  properties: Record<string, unknown>
  label: Translated | null
  linkMapId: string | null
  sort: number
  createdAt: string
  updatedAt: string
}

/** `GET /api/maps/:map`: the map with the layers and features the caller may see. */
export type MapDetailDto = {
  map: MapDto
  layers: MapLayerDto[]
  providerLayers: MapProviderLayerDto[]
  features: MapFeatureDto[]
  /** The caller may draw on this map (`maps:edit`). */
  canEdit: boolean
}

/** The staff view of a map (`/api/admin/maps`). */
export type AdminMapDto = MapDto & {
  source: MapSource
  visibility: Visibility | null
  ownerLabel: Translated | null
  createdAt: string
  updatedAt: string
}

/** The staff view of a layer: every field, the visibility included. */
export type AdminMapLayerDto = MapLayerDto & {
  visibility: Visibility | null
}

/** `GET /api/admin/maps/:id`: the map with every layer and its feature counts. */
export type AdminMapDetailDto = AdminMapDto & {
  layers: Array<AdminMapLayerDto & { featureCount: number }>
}

// --- Maps from code -----------------------------------------------------------------------------------------------------

/** A feature `ensureMap` creates with a new map. */
export type EnsureMapFeature = {
  /** The layer by key; defaults to the first editable layer. */
  layer?: string
  featureKind: string
  geometry: MapGeometry
  properties?: Record<string, unknown>
  label?: Translated | null
  sort?: number
}

/** What `ensureMap` (and `maps:seed:resolve`) take. */
export type EnsureMapDefinition = {
  /** Stable key, unique across maps (`first-aid-opr_123`). */
  key: string
  kind: string
  owner: OwnerRef
  name: Translated
  view?: MapViewport
  visibility?: Visibility | null
  /** Layers besides the kind's default layers (a key that exists already is skipped). */
  layers?: MapKindLayer[]
  features?: EnsureMapFeature[]
}

// --- Hooks --------------------------------------------------------------------------------------------------------------

/** Context of `maps:seed:resolve`: push map definitions into `maps`; maps creates the missing ones once. */
export type MapsSeedResolveContext = {
  event: H3Event
  maps: EnsureMapDefinition[]
}

/**
 * Context of `maps:edit:resolve`: an owner module sets `allowed = true` to let `user` edit `map` (a team's leads, an
 * operation's coordinators). Only asked when neither `maps:manage` nor the kind's `editPermission` allows it.
 */
export type MapsEditResolveContext = {
  event: H3Event
  user: { id: string | number }
  map: AdminMapDto
  allowed: boolean
}

/** Context of `maps:feature:created` and `maps:feature:deleted`. */
export type MapFeatureContext = {
  event: H3Event
  map: AdminMapDto
  feature: MapFeatureDto
}

/** Context of `maps:feature:updated`. `previous` is the feature before the change. */
export type MapFeatureUpdatedContext = MapFeatureContext & {
  previous: MapFeatureDto
}
