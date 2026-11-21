// Geographic helpers for `GeoPoint`s and `MapLocation`s: distances, radius and area checks, anchors and bounds. Pure.
import type { GeoPoint, MapLocation } from '../../types'

/** The mean radius of the earth, in metres. */
export const EARTH_RADIUS_METERS = 6_371_008.8

/** Where the location picker opens without a value: Roskilde, at city level. */
export const DEFAULT_GEO_CENTER: { center: [number, number], zoom: number } = { center: [55.6415, 12.0803], zoom: 13 }

const radians = (degrees: number) => degrees * Math.PI / 180

/** Whether a value is a valid `GeoPoint` (finite, latitude -90..90, longitude -180..180). */
export function isGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== 'object') return false
  const { lat, lng } = value as { lat?: unknown, lng?: unknown }
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

/** The great-circle distance between two points, in metres (haversine). */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = radians(b.lat - a.lat)
  const dLng = radians(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Whether `point` is at most `radiusMeters` from `center`. */
export function isWithinRadius(point: GeoPoint, center: GeoPoint, radiusMeters: number): boolean {
  return haversineMeters(point, center) <= radiusMeters
}

/**
 * Whether `point` is inside a polygon of corners (ray casting on latitude/longitude, which is exact enough for areas a
 * few kilometres across that do not cross the antimeridian). A point on the edge may count either way.
 */
export function isInsideArea(point: GeoPoint, area: readonly GeoPoint[]): boolean {
  if (area.length < 3) return false
  let inside = false
  for (let i = 0, j = area.length - 1; i < area.length; j = i++) {
    const a = area[i]!
    const b = area[j]!
    if ((a.lat > point.lat) !== (b.lat > point.lat)
      && point.lng < (b.lng - a.lng) * (point.lat - a.lat) / (b.lat - a.lat) + a.lng) inside = !inside
  }
  return inside
}

/**
 * Whether `point` is in a location: inside its area, within its radius, or (a bare point) within `toleranceMeters` of
 * it. Check-in rules ("is the volunteer at the bar?") use it.
 */
export function isInLocation(point: GeoPoint, location: MapLocation, toleranceMeters = 0): boolean {
  if (location.area?.length) {
    if (isInsideArea(point, location.area)) return true
    return toleranceMeters > 0 && location.area.some(corner => isWithinRadius(point, corner, toleranceMeters))
  }
  return isWithinRadius(point, location.point, (location.radiusMeters ?? 0) + toleranceMeters)
}

/** The centroid of a polygon of corners (planar on latitude/longitude); the mean of the corners when it has no area. */
export function areaCentroid(area: readonly GeoPoint[]): GeoPoint {
  const corners = area.length > 1 && area[0]!.lat === area.at(-1)!.lat && area[0]!.lng === area.at(-1)!.lng ? area.slice(0, -1) : area
  let twiceArea = 0
  let lat = 0
  let lng = 0
  for (let index = 0; index < corners.length; index++) {
    const a = corners[index]!
    const b = corners[(index + 1) % corners.length]!
    const cross = a.lng * b.lat - b.lng * a.lat
    twiceArea += cross
    lng += (a.lng + b.lng) * cross
    lat += (a.lat + b.lat) * cross
  }
  if (Math.abs(twiceArea) < 1e-15) {
    return {
      lat: corners.reduce((sum, corner) => sum + corner.lat, 0) / corners.length,
      lng: corners.reduce((sum, corner) => sum + corner.lng, 0) / corners.length,
    }
  }
  return { lat: lat / (3 * twiceArea), lng: lng / (3 * twiceArea) }
}

/** The point to draw a location's marker at: its `point` (the picker keeps it at the area's centroid unless moved). */
export const locationAnchor = (location: MapLocation): GeoPoint => location.point

/** The bounds around points as `[[south, west], [north, east]]` (Leaflet's order), or `null` when there are none. */
export function geoBounds(points: readonly GeoPoint[]): [[number, number], [number, number]] | null {
  if (!points.length) return null
  const lats = points.map(point => point.lat)
  const lngs = points.map(point => point.lng)
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
}

/** The bounds around a location: its area, its circle, or its point. */
export function locationBounds(location: MapLocation): [[number, number], [number, number]] {
  if (location.area?.length) return geoBounds([...location.area, location.point])!
  const radius = location.radiusMeters ?? 0
  const dLat = (radius / EARTH_RADIUS_METERS) * (180 / Math.PI)
  const dLng = dLat / Math.max(Math.cos(radians(location.point.lat)), 1e-6)
  return [[location.point.lat - dLat, location.point.lng - dLng], [location.point.lat + dLat, location.point.lng + dLng]]
}
