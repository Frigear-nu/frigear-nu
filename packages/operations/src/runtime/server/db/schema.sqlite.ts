import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// A recurring period or fixed range, see `@frigear-nu/module-kit/schedule`.
type Schedule = import('@frigear-nu/module-kit/schedule').Schedule
// Where the operation takes place, see `OperationLocation` in types.ts: a name and address, and the value of the
// location picker of `@frigear-nu/maps` (a point, with a radius or an area).
type GeoPoint = { lat: number, lng: number }
type OperationLocation = { name?: Translated, address?: string, point?: GeoPoint, radiusMeters?: number, area?: GeoPoint[] }
// The venue layout, see `OperationVenueLayout` in types.ts: a plane feature collection of `@frigear-nu/maps`, with the
// blob pathname of its underlay image.
type OperationVenueLayout = {
  type: 'FeatureCollection'
  features: Array<{ type: 'Feature', id: string, kind: string, geometry: { type: string, coordinates: unknown }, properties: Record<string, unknown>, label?: Translated | null }>
  extent?: { width: number, height: number } | null
  underlay?: { pathname: string, contentType: string, width: number, height: number } | null
  /** `geo`: the positions are `[lng, lat]`, drawn on the map. Default `plane`. */
  crs?: 'plane' | 'geo' | null
}
// How the venue layout is placed and shown, see `PlanePlacement` of `@frigear-nu/maps`: where the plane lies on the
// earth, its underlay (none, map tiles or the image) and opacity, and the grid staff snap to.
type OperationVenuePlacement = {
  georeference?: { origin: GeoPoint, rotation: number, metersPerUnit: number } | null
  underlayMode?: 'none' | 'tiles' | 'image' | null
  underlayOpacity?: number | null
  gridUnit?: 'plane' | 'metres' | null
  gridSize?: number | null
}

export const operations = sqliteTable('operations', {
  /** `opr_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  /** `name` in every language and `slug`, folded for search (`searchText` of `@frigear-nu/module-kit/server`). */
  searchText: text().notNull().default(''),
  description: text({ mode: 'json' }).$type<Translated>(),
  /** Who hosts the occasion: your organisation, or the venue or event it works at. */
  hostName: text(),
  hostUrl: text(),
  startsAt: integer({ mode: 'timestamp' }).notNull(),
  endsAt: integer({ mode: 'timestamp' }),
  /** When the occasion runs, if it is more than the one period above. */
  schedule: text({ mode: 'json' }).$type<Schedule>(),
  location: text({ mode: 'json' }).$type<OperationLocation>(),
  /** Where the bars, stations and containers are: drawn with the plane editor of `@frigear-nu/maps`. */
  venueLayout: text({ mode: 'json' }).$type<OperationVenueLayout>(),
  /** Where the venue layout lies on the map and what is under it; saved apart from the layout (`PUT .../venue-layout/placement`). */
  venuePlacement: text({ mode: 'json' }).$type<OperationVenuePlacement>(),
  /** `planning | active | wrapped_up | archived`. */
  status: text().notNull().default('planning'),
  /** Public operations have a public page and show for everyone; others only for those who take part and for staff. */
  public: integer({ mode: 'boolean' }).notNull().default(false),
  /** The `@frigear-nu/events` event this operation belongs to. No foreign key: events is optional. */
  eventId: text(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('operation_status_idx').on(t.status),
  index('operation_starts_idx').on(t.startsAt),
])
