// Placing a plane layout on the earth: plane units to `[lng, lat]` and back through a `PlaneGeoreference`. Pure, shared
// by the server, the components and the tests.
//
// The plane is placed on a local tangent plane around its origin (east/north metres, then degrees by the local scale).
// That is exact enough for a venue: the error stays below a centimetre per 100 m within a few kilometres.
import type { GeoPoint, PlaneExtent, PlaneFeatureCollection, PlaneGeometry, PlaneGeoreference, PlanePlacement, PlanePosition, PlaneUnderlayMode } from '../../types'
import { EARTH_RADIUS_METERS } from './geo'
import { planeExtentOf } from './geometry'

const DEG = Math.PI / 180

/** The smallest and largest scale a placement may have, in metres per plane unit. */
export const MIN_METERS_PER_UNIT = 0.001
export const MAX_METERS_PER_UNIT = 1000

/** The underlay's opacity bounds. */
export const MIN_UNDERLAY_OPACITY = 0.1

/** A rotation as degrees in `(-180, 180]`. */
export function normalizeRotation(degrees: number): number {
  const turned = ((degrees % 360) + 360) % 360
  return turned > 180 ? turned - 360 : turned
}

/** Whether a layout's positions are `[lng, lat]`. */
export const isGeoLayout = (layout: Pick<PlaneFeatureCollection, 'crs'> | null | undefined) => layout?.crs === 'geo'

/** Whether a layout can be drawn on a geographic map: a `geo` layout, or a plane layout with a georeference. */
export const isPlacedLayout = (layout: Pick<PlaneFeatureCollection, 'crs'> | null | undefined, placement?: PlanePlacement | null) =>
  !!layout && (isGeoLayout(layout) || !!placement?.georeference)

/** The grid steps the editor offers in metres. */
export const METRE_GRID_SIZES = [0.5, 1] as const

/** What is shown under a plane layout: the placement's `underlayMode`, else the image when it has one. Tiles need a georeference. */
export function underlayModeOf(layout: Pick<PlaneFeatureCollection, 'underlay'> | null | undefined, placement: PlanePlacement | null | undefined): PlaneUnderlayMode {
  const mode = placement?.underlayMode ?? (layout?.underlay ? 'image' : 'none')
  if (mode === 'tiles' && !placement?.georeference) return layout?.underlay ? 'image' : 'none'
  if (mode === 'image' && !layout?.underlay) return 'none'
  return mode
}

/** The underlay's opacity, clamped to `0.1`–`1` (default `1`). */
export function underlayOpacityOf(placement: PlanePlacement | null | undefined): number {
  const value = placement?.underlayOpacity
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(1, Math.max(MIN_UNDERLAY_OPACITY, value))
}

/**
 * The grid the editor snaps to, in plane units: the placement's metre grid converted through its scale, else
 * `planeGrid`. `unit` says what the editor shows (`metres` only with a georeference).
 */
export function gridOf(placement: PlanePlacement | null | undefined, planeGrid: number): { unit: 'plane' | 'metres', size: number, planeUnits: number } {
  const georeference = placement?.georeference
  if (placement?.gridUnit === 'metres' && georeference) {
    const size = placement.gridSize && placement.gridSize > 0 ? placement.gridSize : 1
    return { unit: 'metres', size, planeUnits: size / georeference.metersPerUnit }
  }
  return { unit: 'plane', size: planeGrid, planeUnits: planeGrid }
}

/** A length in plane units as metres, `null` while the plane is not placed. */
export const planeLengthInMetres = (units: number, placement: PlanePlacement | null | undefined) =>
  placement?.georeference ? units * placement.georeference.metersPerUnit : null

/** A plane position (`[x, y]`, plane units) as `[lng, lat]`. */
export function planeToGeo(position: readonly [number, number], georeference: PlaneGeoreference): PlanePosition {
  const { origin, rotation, metersPerUnit } = georeference
  const r = rotation * DEG
  const x = position[0] * metersPerUnit
  const y = position[1] * metersPerUnit
  const east = x * Math.cos(r) + y * Math.sin(r)
  const north = -x * Math.sin(r) + y * Math.cos(r)
  const lat = origin.lat + (north / EARTH_RADIUS_METERS) / DEG
  const lng = origin.lng + (east / (EARTH_RADIUS_METERS * Math.cos(origin.lat * DEG))) / DEG
  return [lng, lat]
}

/** A `[lng, lat]` position as a plane position, the inverse of `planeToGeo`. */
export function geoToPlane(position: readonly [number, number], georeference: PlaneGeoreference): PlanePosition {
  const { origin, rotation, metersPerUnit } = georeference
  const r = rotation * DEG
  const north = (position[1] - origin.lat) * DEG * EARTH_RADIUS_METERS
  const east = (position[0] - origin.lng) * DEG * EARTH_RADIUS_METERS * Math.cos(origin.lat * DEG)
  const x = east * Math.cos(r) - north * Math.sin(r)
  const y = east * Math.sin(r) + north * Math.cos(r)
  return [x / metersPerUnit, y / metersPerUnit]
}

/** A geometry with every position mapped. */
export function mapGeometry(geometry: PlaneGeometry, map: (position: PlanePosition) => PlanePosition): PlaneGeometry {
  if (geometry.type === 'Point') return { type: 'Point', coordinates: map(geometry.coordinates) }
  if (geometry.type === 'LineString') return { type: 'LineString', coordinates: geometry.coordinates.map(map) }
  return { type: 'Polygon', coordinates: geometry.coordinates.map(ring => ring.map(map)) }
}

/** A plane geometry in `[lng, lat]`. */
export const geometryToGeo = (geometry: PlaneGeometry, georeference: PlaneGeoreference) => mapGeometry(geometry, position => planeToGeo(position, georeference))

/** A `[lng, lat]` geometry in plane units. */
export const geometryToPlane = (geometry: PlaneGeometry, georeference: PlaneGeoreference) => mapGeometry(geometry, position => geoToPlane(position, georeference))

/** The corners of a plane extent on the earth, as `GeoPoint`s: bottom-left (the origin), bottom-right, top-right, top-left. */
export function extentCorners(extent: PlaneExtent, georeference: PlaneGeoreference): [GeoPoint, GeoPoint, GeoPoint, GeoPoint] {
  const corner = (x: number, y: number): GeoPoint => {
    const [lng, lat] = planeToGeo([x, y], georeference)
    return { lat, lng }
  }
  return [corner(0, 0), corner(extent.width, 0), corner(extent.width, extent.height), corner(0, extent.height)]
}

/**
 * A layout as a `geo` layout: the features of a placed plane layout on the earth, or a `geo` layout as it is. `null`
 * for a plane layout without a georeference. The plane's extent and image are dropped.
 */
export function layoutToGeo(layout: PlaneFeatureCollection, placement?: PlanePlacement | null): PlaneFeatureCollection | null {
  if (isGeoLayout(layout)) return layout
  const georeference = placement?.georeference
  if (!georeference) return null
  return {
    type: 'FeatureCollection',
    crs: 'geo',
    features: layout.features.map(feature => ({ ...feature, geometry: geometryToGeo(feature.geometry, georeference) })),
  }
}

/**
 * A first placement for a plane: centred on `center`, north up, scaled so the plane's longer side spans `spanMeters`.
 * The placement editor starts from it; staff then move, turn and scale it.
 */
export function initialGeoreference(extent: PlaneExtent, center: GeoPoint, spanMeters: number): PlaneGeoreference {
  const longest = Math.max(extent.width, extent.height) || 1
  return placeGeoreference(extent, center, 0, spanMeters / longest)
}

/** A scale clamped to the allowed range. */
export const clampScale = (metersPerUnit: number) => Math.min(MAX_METERS_PER_UNIT, Math.max(MIN_METERS_PER_UNIT, metersPerUnit))

/** The plane's centre on the earth. */
export function placedCenter(layout: Pick<PlaneFeatureCollection, 'extent' | 'underlay'>, georeference: PlaneGeoreference): GeoPoint {
  const extent = planeExtentOf(layout)
  const [lng, lat] = planeToGeo([extent.width / 2, extent.height / 2], georeference)
  return { lat, lng }
}

/** The same placement with the plane's centre at `center`. */
function centeredAt(extent: PlaneExtent, georeference: PlaneGeoreference, center: GeoPoint): PlaneGeoreference {
  const atCenter: PlaneGeoreference = { ...georeference, origin: center }
  const [lng, lat] = planeToGeo([-extent.width / 2, -extent.height / 2], atCenter)
  return { ...georeference, origin: { lat, lng } }
}

/**
 * The placement after its handles moved: keeps the plane's centre at `center`, turns it to `rotation` and scales it to
 * `metersPerUnit`. Every handle of the placement editor (move, turn, scale) goes through it.
 */
export function placeGeoreference(extent: PlaneExtent, center: GeoPoint, rotation: number, metersPerUnit: number): PlaneGeoreference {
  return centeredAt(extent, { origin: center, rotation: normalizeRotation(rotation), metersPerUnit: clampScale(metersPerUnit) }, center)
}

/** The bearing from `a` to `b` in degrees clockwise from north (local, flat). */
export function bearingDegrees(a: GeoPoint, b: GeoPoint): number {
  const north = (b.lat - a.lat) * DEG
  const east = (b.lng - a.lng) * DEG * Math.cos(a.lat * DEG)
  return Math.atan2(east, north) / DEG
}
