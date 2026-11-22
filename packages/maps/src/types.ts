import type { Translated } from '@frigear-nu/ui/translated'

export type { Translated }

// --- Values a module stores -------------------------------------------------------------------------------------------

/** A point on the earth: latitude and longitude in degrees (WGS 84). */
export type GeoPoint = { lat: number, lng: number }

/**
 * Where something is, as the location picker (`<MapLocationField>`) edits it: a point, and either a radius around it or
 * an area. With an area, `point` is its anchor (the picker puts it at the area's centroid, staff can move it).
 */
export type MapLocation = {
  point: GeoPoint
  /** A circle around `point`, in metres. Never set together with `area`. */
  radiusMeters?: number
  /** A polygon: its corners, at least three, not closed (the first corner is not repeated). */
  area?: GeoPoint[]
}

/** The kinds of location the picker offers: a point only, a point with a radius, an area. */
export type MapLocationMode = 'point' | 'radius' | 'area'

/** A position on a plane: `[x, y]` in plane units, `y` growing upwards (GeoJSON order, Leaflet `CRS.Simple`). */
export type PlanePosition = [number, number]

export type PlanePointGeometry = { type: 'Point', coordinates: PlanePosition }
export type PlaneLineStringGeometry = { type: 'LineString', coordinates: PlanePosition[] }
export type PlanePolygonGeometry = { type: 'Polygon', coordinates: PlanePosition[][] }

/** The GeoJSON geometries a plane feature may have, in plane units. Polygon rings are closed. */
export type PlaneGeometry = PlanePointGeometry | PlaneLineStringGeometry | PlanePolygonGeometry

/** A GeoJSON geometry type. */
export type MapGeometryType = PlaneGeometry['type']

/** One drawn feature of a plane layout: a seat, a station, a container. */
export type PlaneFeature = {
  type: 'Feature'
  /** Stable within its collection: other records refer to the feature by it (`featureId`). Never reused. */
  id: string
  /** A registered feature kind (`operations.station`, `maps.area`). */
  kind: string
  geometry: PlaneGeometry
  /** What the kind's properties form edits, validated by its zod schema. */
  properties: Record<string, unknown>
  /** Shown on the feature and in its details. */
  label?: Translated | null
}

/** The image under a plane layout: one plane unit per pixel, placed at the origin. */
export type PlaneUnderlay = {
  url: string
  width: number
  height: number
}

/** The size of a plane in plane units: features live within `[0, 0]` to `[width, height]`. */
export type PlaneExtent = { width: number, height: number }

/**
 * A plane layout, as the plane editor (`<MapPlaneEditor>`) edits it: a GeoJSON FeatureCollection in plane units with
 * an optional underlay image and extent. Layout only: it says where things are, never who sits where.
 */
export type PlaneFeatureCollection = {
  type: 'FeatureCollection'
  features: PlaneFeature[]
  /** The plane's size; defaults to the underlay's size, then to 1000 by 1000. */
  extent?: PlaneExtent | null
  underlay?: PlaneUnderlay | null
}

/** A location the geographic viewer shows, with what to call it. */
export type MapViewerLocation = {
  id: string
  location: MapLocation
  label?: Translated | null
  /** A palette name or CSS colour (see `MapFeatureKindDefinition.color`). */
  color?: string
}

/** What the viewers report when someone taps something on the map. */
export type MapSelection = {
  /** A feature of the layout, a location, or a feature of a live layer. */
  source: 'feature' | 'location' | 'live'
  id: string
  label: Translated | null
  /** The feature kind (`source: 'feature'`). */
  kind?: string
  /** The live layer's id (`source: 'live'`). */
  layer?: string
  properties: Record<string, unknown>
}

// --- Live layers ---------------------------------------------------------------------------------------------------------

/** A GeoJSON feature as a live layer's route returns it. `properties.label` (or `name`) is shown in its popup. */
export type MapLiveFeature = {
  type: 'Feature'
  id?: string | number
  geometry: PlaneGeometry
  properties?: Record<string, unknown> | null
}

/** What a live layer's route returns: positions in the units of the surface it is drawn on. */
export type MapLiveFeatureCollection = {
  type: 'FeatureCollection'
  features: MapLiveFeature[]
}

// --- Registry (build time) ------------------------------------------------------------------------------------------

/** A kind of feature: its geometry, its properties form and how it is shown (`defineMapFeatureKind`). */
export type MapFeatureKindDefinition = {
  /** Unique id, prefixed with the module (`operations.station`, `seating.seat`). */
  id: string
  label: Translated
  /** An Iconify name (`i-lucide-beer`). */
  icon?: string
  /** The geometries it may have. */
  geometry: MapGeometryType | MapGeometryType[]
  /** A colour for markers, lines and areas: a palette name (`primary`, `warning`, ...), `#hex`, `rgb()` or `hsl()`. */
  color?: string
  /**
   * Absolute path to a file default-exporting a zod object (`z.object({...})`) for the feature's `properties`. It is
   * bundled into the app (the editor builds its form from it) and into the server (`validatePlaneLayout` checks with
   * it), so it may only import `zod` and `@frigear-nu/maps/properties`, never `#imports`.
   */
  properties?: string
  /** Absolute path to a Vue component shown in the viewers' details of such a feature (props: `feature`, a `MapSelection`). */
  component?: string
}

/**
 * A layer whose features come from a module's own route, such as who is on shift now (`defineMapLayer`). The viewer
 * fetches it; nothing is stored.
 */
export type MapLayerDefinition = {
  /** Unique id, prefixed with the module (`shifts.on-duty`). */
  id: string
  label: Translated
  /**
   * The surfaces it is drawn on: a name the module that shows the viewer chooses (`operations.venue-layout`). A viewer
   * with `surface="operations.venue-layout"` draws every layer that applies to it.
   */
  appliesTo: string | string[]
  /**
   * The route that returns the layer's GeoJSON, as a path with `:params` (`/api/shifts/operations/:operationId/on-duty`).
   * The viewer fills them from its `params` prop and skips the layer when one is missing.
   */
  endpoint: string
  /** Refetch every this many seconds while the viewer is open (at least 5). */
  refreshInterval?: number
  /**
   * The permission the route checks (`shifts:read`). Documentation for the viewer's readers: the route enforces it, and
   * the viewer hides a layer whose route answers 401 or 403.
   */
  permission?: string
  /** Shown when the viewer opens. Defaults to `true`. */
  visible?: boolean
  /** A colour for its markers (see `MapFeatureKindDefinition.color`). Defaults to `info`. */
  color?: string
}

/** What `extendMaps` registers. */
export type MapsExtension = {
  /** Feature kinds: what may be drawn on a plane layout. */
  kinds?: MapFeatureKindDefinition[]
  layers?: MapLayerDefinition[]
}

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

/** A live layer as the runtime registry holds it (JSON). */
export type MapLayerInfo = {
  id: string
  label: Translated
  appliesTo: string[]
  endpoint: string
  refreshInterval: number | null
  permission: string | null
  visible: boolean
  color: string | null
}

// --- Module options ---------------------------------------------------------------------------------------------------

/** The tile server of geographic maps. Defaults to OpenStreetMap's, which forbids heavy use: see the docs. */
export type MapTilesOptions = {
  url: string
  attribution: string
  maxZoom?: number
}

export type ModuleOptions = {
  /** The tile layer of the location picker and geographic viewers. Defaults to OpenStreetMap's public tiles. */
  tiles?: MapTilesOptions
  /** Feature kinds and live layers of the host, the same as `extendMaps` from a module. */
  kinds?: MapFeatureKindDefinition[]
  layers?: MapLayerDefinition[]
  /**
   * Where the location picker and viewers open when they have no value (`[lat, lng]` and zoom). There is no default
   * location: without it they open on a world view (`[0, 0]`, zoom 2).
   */
  defaultCenter?: { center: [number, number], zoom: number }
  /** The largest underlay image `readMapUnderlay` accepts, in bytes. Defaults to 10 MB. */
  maxUnderlayBytes?: number
}

export type PublicModuleOptions = {
  tiles: Required<MapTilesOptions>
  defaultCenter: { center: [number, number], zoom: number }
  maxUnderlayBytes: number
}
