// The venue layout of an operation: which feature kinds of `@frigear-nu/maps` it may hold, and the surface name live
// layers (such as the on-duty layer of shifts) apply to. Pure, shared by the module, the routes, the app and the tests.

/** The surface name of the venue layout viewer: a live layer with `appliesTo: OPERATIONS_VENUE_SURFACE` is drawn on it. */
export const OPERATIONS_VENUE_SURFACE = 'operations.venue-layout'

/** The feature kinds operations registers (`module.ts`). */
export const OPERATIONS_STATION_KIND = 'operations.station'
export const OPERATIONS_CONTAINER_KIND = 'operations.container'

/** What may be drawn on a venue layout: stations and containers, and the built-in areas, lines, labels and markers. */
export const OPERATIONS_VENUE_KINDS = [
  OPERATIONS_STATION_KIND,
  OPERATIONS_CONTAINER_KIND,
  'maps.area',
  'maps.line',
  'maps.label',
  'maps.marker',
] as const

/**
 * The revision of a stored venue layout: a hash of the stored value, answered with the layout (`revision`) so a client
 * can send it back with a change and get a 409 when someone changed the layout since it read it.
 */
export function operationVenueRevision(venueLayout: unknown): string {
  // cyrb53: a fast 53-bit string hash (not a security measure: it only tells two versions apart).
  const text = JSON.stringify(venueLayout ?? null)
  let h1 = 0xDEADBEEF
  let h2 = 0x41C6CE57
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}
