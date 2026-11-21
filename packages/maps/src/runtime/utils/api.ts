// Typed path builders of the maps HTTP API. App code, tests and docs use these instead of string literals, so a changed
// URL is changed in one place. Every id and key is URL-encoded.

const enc = encodeURIComponent

/** Read and edit routes, under `/api/maps`. A `map` segment takes the map's id or its key. */
const PUBLIC_BASE = '/api/maps'
/** Staff routes, under `/api/admin/maps`. */
const ADMIN_BASE = '/api/admin/maps'

export const mapsApi = {
  /** `GET` the maps the caller may see (`?ownerType=&ownerId=` filters). */
  list: PUBLIC_BASE,
  /** `GET` one map (by id or key) with its visible layers and features. */
  map: (map: string) => `${PUBLIC_BASE}/${enc(map)}`,
  /** `GET` the GeoJSON of a provider layer of a map. */
  layer: (map: string, layerKey: string) => `${PUBLIC_BASE}/${enc(map)}/layers/${enc(layerKey)}`,
  /** `POST` a feature to a map (`maps:edit`). */
  features: (map: string) => `${PUBLIC_BASE}/${enc(map)}/features`,
  /** `PATCH` / `DELETE` one feature of a map (`maps:edit`). */
  feature: (map: string, featureId: string) => `${PUBLIC_BASE}/${enc(map)}/features/${enc(featureId)}`,
  /** `GET` the underlay image of a plane map. */
  underlay: (map: string) => `${PUBLIC_BASE}/${enc(map)}/underlay`,
  admin: {
    /** `GET` (paginated) / `POST` maps. */
    maps: ADMIN_BASE,
    /** `GET` / `PATCH` / `DELETE` one map. */
    map: (id: string) => `${ADMIN_BASE}/${enc(id)}`,
    /** `POST` a layer to a map. */
    layers: (id: string) => `${ADMIN_BASE}/${enc(id)}/layers`,
    /** `PATCH` / `DELETE` one layer of a map. */
    layer: (id: string, layerId: string) => `${ADMIN_BASE}/${enc(id)}/layers/${enc(layerId)}`,
    /** `POST` (multipart) / `DELETE` the underlay image of a plane map. */
    underlay: (id: string) => `${ADMIN_BASE}/${enc(id)}/underlay`,
  },
} as const
