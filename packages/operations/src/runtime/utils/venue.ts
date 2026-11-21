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
