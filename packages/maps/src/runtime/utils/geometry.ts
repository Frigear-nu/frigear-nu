// GeoJSON geometry checks for the features maps stores. Pure, shared by the server (validation) and the editor.
import type { MapBase, MapEditorTool, MapGeometry, MapGeometryType, MapPosition } from '../../types'

export const MAP_GEOMETRY_TYPES = ['Point', 'LineString', 'Polygon'] as const satisfies readonly MapGeometryType[]

export const MAP_EDITOR_TOOLS = ['marker', 'polyline', 'polygon', 'rectangle', 'text', 'snapGrid'] as const satisfies readonly MapEditorTool[]

/** The geometry each drawing tool makes (`snapGrid` draws nothing). */
export const EDITOR_TOOL_GEOMETRY: Record<Exclude<MapEditorTool, 'snapGrid'>, MapGeometryType> = {
  marker: 'Point',
  text: 'Point',
  polyline: 'LineString',
  polygon: 'Polygon',
  rectangle: 'Polygon',
}

/** The most positions one geometry may have, so a feature stays a reasonable size. */
export const MAX_POSITIONS = 5000

export type GeometryCheck = { ok: true, geometry: MapGeometry } | { ok: false, message: string }

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function checkPosition(value: unknown, base: MapBase): MapPosition | string {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3 || !value.every(isNumber)) {
    return 'A position is an array of two numbers.'
  }
  const [x, y] = value as number[]
  if (base === 'geo' && (x! < -180 || x! > 180 || y! < -90 || y! > 90)) {
    return 'A position on a geo map is [longitude, latitude] within -180..180 and -90..90.'
  }
  if (base === 'plane' && (Math.abs(x!) > 1e7 || Math.abs(y!) > 1e7)) return 'A position on a plane map is out of range.'
  return [x!, y!]
}

function checkPositions(value: unknown, base: MapBase, min: number): MapPosition[] | string {
  if (!Array.isArray(value)) return 'Coordinates must be an array of positions.'
  if (value.length < min) return `At least ${min} positions are needed.`
  const positions: MapPosition[] = []
  for (const item of value) {
    const position = checkPosition(item, base)
    if (typeof position === 'string') return position
    positions.push(position)
  }
  return positions
}

const samePosition = (a: MapPosition, b: MapPosition) => a[0] === b[0] && a[1] === b[1]

/**
 * Validates a GeoJSON geometry of the types maps stores (`Point`, `LineString`, `Polygon`) on a map base, and returns
 * it with only the GeoJSON keys (positions as `[x, y]`). Polygon rings must be closed and have at least four
 * positions; an unclosed ring is closed. `allowed` narrows the types.
 */
export function validateGeometry(value: unknown, base: MapBase, allowed: readonly MapGeometryType[] = MAP_GEOMETRY_TYPES): GeometryCheck {
  if (!value || typeof value !== 'object') return { ok: false, message: 'The geometry must be a GeoJSON object.' }
  const { type, coordinates } = value as { type?: unknown, coordinates?: unknown }
  if (typeof type !== 'string' || !(MAP_GEOMETRY_TYPES as readonly string[]).includes(type)) {
    return { ok: false, message: `The geometry type must be one of ${MAP_GEOMETRY_TYPES.join(', ')}.` }
  }
  if (!allowed.includes(type as MapGeometryType)) {
    return { ok: false, message: `This feature kind cannot be a ${type}; it can be ${allowed.join(' or ')}.` }
  }
  if (type === 'Point') {
    const position = checkPosition(coordinates, base)
    return typeof position === 'string' ? { ok: false, message: position } : { ok: true, geometry: { type, coordinates: position } }
  }
  if (type === 'LineString') {
    const positions = checkPositions(coordinates, base, 2)
    if (typeof positions === 'string') return { ok: false, message: positions }
    if (positions.length > MAX_POSITIONS) return { ok: false, message: 'The line has too many positions.' }
    return { ok: true, geometry: { type, coordinates: positions } }
  }
  if (!Array.isArray(coordinates) || !coordinates.length) return { ok: false, message: 'A polygon needs at least one ring.' }
  const rings: MapPosition[][] = []
  let total = 0
  for (const ring of coordinates) {
    const positions = checkPositions(ring, base, 3)
    if (typeof positions === 'string') return { ok: false, message: positions }
    if (!samePosition(positions[0]!, positions.at(-1)!)) positions.push([...positions[0]!] as MapPosition)
    if (positions.length < 4) return { ok: false, message: 'A polygon ring needs at least three corners.' }
    total += positions.length
    rings.push(positions)
  }
  if (total > MAX_POSITIONS) return { ok: false, message: 'The polygon has too many positions.' }
  return { ok: true, geometry: { type: 'Polygon', coordinates: rings } }
}

/** Every position of a geometry, for bounds. */
export function geometryPositions(geometry: MapGeometry): MapPosition[] {
  if (geometry.type === 'Point') return [geometry.coordinates]
  if (geometry.type === 'LineString') return geometry.coordinates
  return geometry.coordinates.flat()
}

/** The geometry types a feature kind may have, as a list. */
export function geometryTypesOf(geometry: MapGeometryType | readonly MapGeometryType[]): MapGeometryType[] {
  return [geometry].flat() as MapGeometryType[]
}

/** The editor tools that draw a geometry the feature kinds can have (`snapGrid` is never derived). */
export function toolsForGeometries(types: readonly MapGeometryType[]): MapEditorTool[] {
  return (Object.keys(EDITOR_TOOL_GEOMETRY) as Array<keyof typeof EDITOR_TOOL_GEOMETRY>)
    .filter(tool => types.includes(EDITOR_TOOL_GEOMETRY[tool]))
}
