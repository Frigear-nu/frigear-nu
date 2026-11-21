// Where on a map a shift's location is drawn. Pure: the maps layer (`server/maps/on-duty.ts`) and the tests share it.
// The geometry is GeoJSON as maps stores it (`Point`, `LineString` or `Polygon`); positions are `[x, y]` (longitude and
// latitude on a geo map, plane units on a floor plan).

type Position = [number, number]
type Geometry = { type: string, coordinates: unknown }

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number'

const mean = (positions: Position[]): Position => [
  positions.reduce((sum, position) => sum + position[0], 0) / positions.length,
  positions.reduce((sum, position) => sum + position[1], 0) / positions.length,
]

/** The point halfway along a line, by length (planar, which is close enough for the lines of one venue). */
function lineMidpoint(line: Position[]): Position {
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

/** The centroid of a polygon's outer ring; the mean of its corners when the ring has no area. */
function ringCentroid(ring: Position[]): Position {
  // The ring is closed (first = last): leave the repeated corner out of the mean.
  const open = ring.length > 1 && ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring
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

/**
 * The point a layer draws for a feature: a point as it is, a line at its middle, a polygon at its centroid. `null` when
 * the geometry is not one maps stores.
 */
export function geometryAnchor(geometry: Geometry | null | undefined): Position | null {
  if (!geometry) return null
  const { type, coordinates } = geometry
  if (type === 'Point') return isPosition(coordinates) ? [coordinates[0], coordinates[1]] : null
  if (type === 'LineString') {
    if (!Array.isArray(coordinates) || coordinates.length < 2 || !coordinates.every(isPosition)) return null
    return lineMidpoint(coordinates as Position[])
  }
  if (type === 'Polygon') {
    const ring = Array.isArray(coordinates) ? coordinates[0] : undefined
    if (!Array.isArray(ring) || ring.length < 3 || !ring.every(isPosition)) return null
    return ringCentroid(ring as Position[])
  }
  return null
}
