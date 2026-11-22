// Plane geometry: validation, anchors, bounds and snapping. Pure, shared by the server, the components and the tests.
//
// GeoJSON stores positions as `[x, y]`. Leaflet takes `[lat, lng]`, which is `[y, x]` on a plane (`CRS.Simple`), so the
// components convert with `toLatLng` / `toPosition`.
import type { MapGeometryType, PlaneExtent, PlaneFeatureCollection, PlaneGeometry, PlanePosition } from '../../types'

export const MAP_GEOMETRY_TYPES = ['Point', 'LineString', 'Polygon'] as const satisfies readonly MapGeometryType[]

/** The plane editor's drawing tools. */
export type PlaneEditorTool = 'marker' | 'polyline' | 'polygon' | 'rectangle'

/** The geometry each drawing tool makes. */
export const EDITOR_TOOL_GEOMETRY: Record<PlaneEditorTool, MapGeometryType> = {
  marker: 'Point',
  polyline: 'LineString',
  polygon: 'Polygon',
  rectangle: 'Polygon',
}

/** The most positions one geometry may have, so a feature stays a reasonable size. */
export const MAX_POSITIONS = 5000

/** The largest absolute coordinate on a plane. */
export const MAX_PLANE_COORDINATE = 1e7

/** The grid the plane editor snaps to by default, in plane units. */
export const PLANE_GRID_SIZE = 10

/** The extent of a plane without an underlay or an extent of its own. */
export const DEFAULT_PLANE_EXTENT: PlaneExtent = { width: 1000, height: 1000 }

export type GeometryCheck = { ok: true, geometry: PlaneGeometry } | { ok: false, message: string }

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function checkPosition(value: unknown): PlanePosition | string {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3 || !value.every(isNumber)) {
    return 'A position is an array of two numbers.'
  }
  const [x, y] = value as number[]
  if (Math.abs(x!) > MAX_PLANE_COORDINATE || Math.abs(y!) > MAX_PLANE_COORDINATE) return 'The position is out of range.'
  return [x!, y!]
}

function checkPositions(value: unknown, min: number): PlanePosition[] | string {
  if (!Array.isArray(value)) return 'Coordinates must be an array of positions.'
  if (value.length < min) return `At least ${min} positions are needed.`
  const positions: PlanePosition[] = []
  for (const item of value) {
    const position = checkPosition(item)
    if (typeof position === 'string') return position
    positions.push(position)
  }
  return positions
}

const samePosition = (a: PlanePosition, b: PlanePosition) => a[0] === b[0] && a[1] === b[1]

/**
 * Validates a plane geometry (`Point`, `LineString` or `Polygon`) and returns it with only the GeoJSON keys (positions
 * as `[x, y]`). Polygon rings must have at least three corners; an unclosed ring is closed. `allowed` narrows the types.
 */
export function validateGeometry(value: unknown, allowed: readonly MapGeometryType[] = MAP_GEOMETRY_TYPES): GeometryCheck {
  if (!value || typeof value !== 'object') return { ok: false, message: 'The geometry must be a GeoJSON object.' }
  const { type, coordinates } = value as { type?: unknown, coordinates?: unknown }
  if (typeof type !== 'string' || !(MAP_GEOMETRY_TYPES as readonly string[]).includes(type)) {
    return { ok: false, message: `The geometry type must be one of ${MAP_GEOMETRY_TYPES.join(', ')}.` }
  }
  if (!allowed.includes(type as MapGeometryType)) {
    return { ok: false, message: `This feature kind cannot be a ${type}; it can be ${allowed.join(' or ')}.` }
  }
  if (type === 'Point') {
    const position = checkPosition(coordinates)
    return typeof position === 'string' ? { ok: false, message: position } : { ok: true, geometry: { type, coordinates: position } }
  }
  if (type === 'LineString') {
    const positions = checkPositions(coordinates, 2)
    if (typeof positions === 'string') return { ok: false, message: positions }
    if (positions.length > MAX_POSITIONS) return { ok: false, message: 'The line has too many positions.' }
    return { ok: true, geometry: { type, coordinates: positions } }
  }
  if (!Array.isArray(coordinates) || !coordinates.length) return { ok: false, message: 'A polygon needs at least one ring.' }
  const rings: PlanePosition[][] = []
  let total = 0
  for (const ring of coordinates) {
    const positions = checkPositions(ring, 3)
    if (typeof positions === 'string') return { ok: false, message: positions }
    if (!samePosition(positions[0]!, positions.at(-1)!)) positions.push([...positions[0]!] as PlanePosition)
    if (positions.length < 4) return { ok: false, message: 'A polygon ring needs at least three corners.' }
    total += positions.length
    rings.push(positions)
  }
  if (total > MAX_POSITIONS) return { ok: false, message: 'The polygon has too many positions.' }
  return { ok: true, geometry: { type: 'Polygon', coordinates: rings } }
}

/** Every position of a geometry. */
export function geometryPositions(geometry: PlaneGeometry): PlanePosition[] {
  if (geometry.type === 'Point') return [geometry.coordinates]
  if (geometry.type === 'LineString') return geometry.coordinates
  return geometry.coordinates.flat()
}

/** The geometry types a feature kind may have, as a list. */
export function geometryTypesOf(geometry: MapGeometryType | readonly MapGeometryType[]): MapGeometryType[] {
  return [geometry].flat() as MapGeometryType[]
}

/** The drawing tools that make a geometry of these types. */
export function toolsForGeometries(types: readonly MapGeometryType[]): PlaneEditorTool[] {
  return (Object.keys(EDITOR_TOOL_GEOMETRY) as PlaneEditorTool[]).filter(tool => types.includes(EDITOR_TOOL_GEOMETRY[tool]))
}

const mean = (positions: PlanePosition[]): PlanePosition => [
  positions.reduce((sum, position) => sum + position[0], 0) / positions.length,
  positions.reduce((sum, position) => sum + position[1], 0) / positions.length,
]

/** A ring without its closing corner. */
export const openRing = <T extends readonly [number, number]>(ring: T[]): T[] =>
  ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring

/** The centroid of a ring (closed or not); the mean of its corners when it has no area. */
export function ringCentroid(ring: PlanePosition[]): PlanePosition {
  const open = openRing(ring)
  let area = 0
  let x = 0
  let y = 0
  for (let index = 0; index < open.length; index++) {
    const a = open[index]!
    const b = open[(index + 1) % open.length]!
    const cross = a[0] * b[1] - b[0] * a[1]
    area += cross
    x += (a[0] + b[0]) * cross
    y += (a[1] + b[1]) * cross
  }
  if (Math.abs(area) < 1e-12) return mean(open)
  return [x / (3 * area), y / (3 * area)]
}

/** The point halfway along a line, by length. */
export function lineMidpoint(line: PlanePosition[]): PlanePosition {
  const lengths = line.slice(1).map((position, index) => Math.hypot(position[0] - line[index]![0], position[1] - line[index]![1]))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (!total) return line[0]!
  let remaining = total / 2
  for (const [index, length] of lengths.entries()) {
    if (remaining <= length) {
      const from = line[index]!
      const to = line[index + 1]!
      const ratio = length ? remaining / length : 0
      return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]
    }
    remaining -= length
  }
  return line.at(-1)!
}

/**
 * The point a marker or a live layer draws for a geometry: a point as it is, a line at its middle, a polygon at the
 * centroid of its outer ring. `null` for anything that is not a valid plane geometry.
 */
export function geometryAnchor(geometry: unknown): PlanePosition | null {
  const check = validateGeometry(geometry)
  if (!check.ok) return null
  const valid = check.geometry
  if (valid.type === 'Point') return valid.coordinates
  if (valid.type === 'LineString') return lineMidpoint(valid.coordinates)
  return ringCentroid(valid.coordinates[0]!)
}

/** The bounds around geometries as `[[minX, minY], [maxX, maxY]]`, or `null` when there are none. */
export function geometryBounds(geometries: readonly PlaneGeometry[]): [PlanePosition, PlanePosition] | null {
  const positions = geometries.flatMap(geometryPositions)
  if (!positions.length) return null
  const xs = positions.map(position => position[0])
  const ys = positions.map(position => position[1])
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]]
}

/** The extent of a plane layout: its own, else its underlay's size, else 1000 by 1000. */
export function planeExtentOf(layout: Pick<PlaneFeatureCollection, 'extent' | 'underlay'> | null | undefined): PlaneExtent {
  if (layout?.extent?.width && layout.extent.height) return { width: layout.extent.width, height: layout.extent.height }
  if (layout?.underlay?.width && layout.underlay.height) return { width: layout.underlay.width, height: layout.underlay.height }
  return { ...DEFAULT_PLANE_EXTENT }
}

/** A GeoJSON position as a Leaflet `[lat, lng]` (`[y, x]`) pair. */
export const toLatLng = (position: readonly [number, number]): [number, number] => [position[1], position[0]]

/** A Leaflet `[lat, lng]` pair as a GeoJSON position. */
export const toPosition = (latLng: readonly [number, number]): PlanePosition => [latLng[1], latLng[0]]

/** Rounds a value to the nearest multiple of `size`. */
export const snapValue = (value: number, size = PLANE_GRID_SIZE) => Math.round(value / size) * size

/** A geometry with every position snapped to the grid. */
export function snapGeometry(geometry: PlaneGeometry, size = PLANE_GRID_SIZE): PlaneGeometry {
  const snap = (position: PlanePosition): PlanePosition => [snapValue(position[0], size), snapValue(position[1], size)]
  if (geometry.type === 'Point') return { type: 'Point', coordinates: snap(geometry.coordinates) }
  if (geometry.type === 'LineString') return { type: 'LineString', coordinates: geometry.coordinates.map(snap) }
  return { type: 'Polygon', coordinates: geometry.coordinates.map(ring => ring.map(snap)) }
}
