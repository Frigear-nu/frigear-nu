// Views and coordinates of the two map bases. Pure, shared by the server (validation) and the components.
//
// GeoJSON stores positions as `[x, y]`: `[lng, lat]` on geo maps, plane units on plane maps. Leaflet uses `[lat, lng]`
// (`[y, x]` on a plane map with `CRS.Simple`). Views and underlay bounds are stored in Leaflet's order, as Leaflet takes
// them; feature geometries in GeoJSON's.
import type { GeoMapViewport, MapBase, MapGeometry, MapLatLng, MapPosition, MapViewport, PlaneMapViewport } from '../../types'
import { geometryPositions } from './geometry'

/** The view of a new geo map when its kind sets none: Roskilde, at city level. */
export const DEFAULT_GEO_VIEW: GeoMapViewport = { center: [55.6415, 12.0803], zoom: 13 }

/** The extent of a new plane map when its kind sets none: 1000 by 1000 units. */
export const DEFAULT_PLANE_VIEW: PlaneMapViewport = { bounds: [[0, 0], [1000, 1000]] }

/** The grid plane maps snap to, in plane units. */
export const PLANE_GRID_SIZE = 10

export const isGeoView = (view: MapViewport | null | undefined): view is GeoMapViewport => !!view && 'center' in view
export const isPlaneView = (view: MapViewport | null | undefined): view is PlaneMapViewport => !!view && 'bounds' in view

/** The default view of a base. */
export function defaultViewFor(base: MapBase): MapViewport {
  return base === 'geo'
    ? { center: [...DEFAULT_GEO_VIEW.center], zoom: DEFAULT_GEO_VIEW.zoom }
    : { bounds: [[...DEFAULT_PLANE_VIEW.bounds[0]], [...DEFAULT_PLANE_VIEW.bounds[1]]] }
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isPair = (value: unknown): value is MapLatLng => Array.isArray(value) && value.length === 2 && value.every(isNumber)

/** Why a view does not fit a base, or `null` when it does. */
export function viewIssue(base: MapBase, view: unknown): string | null {
  if (!view || typeof view !== 'object') return 'The view must be an object.'
  if (base === 'geo') {
    const { center, zoom, ...rest } = view as { center?: unknown, zoom?: unknown }
    if (Object.keys(rest).length) return 'A geo view has only `center` and `zoom`.'
    if (!isPair(center)) return 'A geo view needs `center: [lat, lng]`.'
    if (center[0] < -90 || center[0] > 90 || center[1] < -180 || center[1] > 180) return 'The centre is not a valid latitude/longitude.'
    if (!isNumber(zoom) || zoom < 0 || zoom > 22) return 'The zoom must be a number from 0 to 22.'
    return null
  }
  const { bounds, ...rest } = view as { bounds?: unknown }
  if (Object.keys(rest).length) return 'A plane view has only `bounds`.'
  return boundsIssue(bounds)
}

/** Why plane bounds are invalid, or `null`: `[[y0, x0], [y1, x1]]` with `y1 > y0` and `x1 > x0`. */
export function boundsIssue(bounds: unknown): string | null {
  if (!Array.isArray(bounds) || bounds.length !== 2 || !isPair(bounds[0]) || !isPair(bounds[1])) {
    return 'Bounds are `[[y0, x0], [y1, x1]]`.'
  }
  const [[y0, x0], [y1, x1]] = bounds as [MapLatLng, MapLatLng]
  if (y1 <= y0 || x1 <= x0) return 'The second corner of the bounds must be above and right of the first.'
  if ([y0, x0, y1, x1].some(value => Math.abs(value) > 1e7)) return 'The bounds are out of range.'
  return null
}

/** The plane bounds of an image of `width` by `height` pixels placed at the origin. */
export function planeBoundsFor(width: number, height: number): [MapLatLng, MapLatLng] {
  return [[0, 0], [height, width]]
}

/** A GeoJSON position as a Leaflet `[lat, lng]` (or `[y, x]`) pair. */
export const toLatLng = (position: MapPosition): MapLatLng => [position[1], position[0]]

/** A Leaflet `[lat, lng]` pair as a GeoJSON position. */
export const toPosition = (latLng: MapLatLng): MapPosition => [latLng[1], latLng[0]]

/** The bounds (`[[south, west], [north, east]]`, Leaflet's order) around geometries, or `null` when there are none. */
export function boundsOfGeometries(geometries: MapGeometry[]): [MapLatLng, MapLatLng] | null {
  const positions = geometries.flatMap(geometryPositions)
  if (!positions.length) return null
  const xs = positions.map(position => position[0])
  const ys = positions.map(position => position[1])
  return [[Math.min(...ys), Math.min(...xs)], [Math.max(...ys), Math.max(...xs)]]
}

/** Rounds a value to the nearest multiple of `size`. */
export const snapValue = (value: number, size = PLANE_GRID_SIZE) => Math.round(value / size) * size

/** A geometry with every position snapped to the grid (plane maps). */
export function snapGeometry(geometry: MapGeometry, size = PLANE_GRID_SIZE): MapGeometry {
  const snap = (position: MapPosition): MapPosition => [snapValue(position[0], size), snapValue(position[1], size)]
  if (geometry.type === 'Point') return { type: 'Point', coordinates: snap(geometry.coordinates) }
  if (geometry.type === 'LineString') return { type: 'LineString', coordinates: geometry.coordinates.map(snap) }
  return { type: 'Polygon', coordinates: geometry.coordinates.map(ring => ring.map(snap)) }
}
