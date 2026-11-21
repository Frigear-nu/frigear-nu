import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// (declared here, not imported: this file is merged into the generated schema as plain text)
// A text in one language, or a `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
type Translated = string | Record<string, string>
// Who may see a record, see `Visibility` in `@frigear-nu/audience`.
type Visibility = { public?: boolean, globalRoles?: string[], minTeamRole?: { kind: string, role: string }, operationId?: string }
// Geo: `{ center: [lat, lng], zoom }`. Plane: `{ bounds: [[y0, x0], [y1, x1]] }`.
type MapViewport = { center: [number, number], zoom: number } | { bounds: [[number, number], [number, number]] }
// The floor plan under a plane map: a NuxtHub Blob pathname and where it is placed.
type MapUnderlay = { pathname: string, contentType: string, width: number, height: number, bounds: [[number, number], [number, number]] }
// A GeoJSON geometry (`Point`, `LineString`, `Polygon`); plane maps use plane units.
type MapGeometry = { type: 'Point', coordinates: [number, number] }
  | { type: 'LineString', coordinates: [number, number][] }
  | { type: 'Polygon', coordinates: [number, number][][] }

export const maps = sqliteTable('maps', {
  /** `map_` + random id. */
  id: text().primaryKey(),
  /** Stable key of maps created from code (`ensureMap`), unique; optional for maps made in the admin. */
  key: text().unique(),
  /** A registered map kind id. */
  kind: text().notNull(),
  /** `geo | plane`, from the kind. */
  base: text().notNull(),
  /** `operation`, `team`, `user`, `platform` or a type another module adds. */
  ownerType: text().notNull(),
  /** The owner's id as text; `null` for `platform`. */
  ownerId: text(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  view: text({ mode: 'json' }).$type<MapViewport>().notNull(),
  underlay: text({ mode: 'json' }).$type<MapUnderlay>(),
  /** `null`: signed-in viewers. */
  visibility: text({ mode: 'json' }).$type<Visibility>(),
  /** `admin | code`. */
  source: text().notNull().default('admin'),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('map_owner_idx').on(t.ownerType, t.ownerId),
  index('map_kind_idx').on(t.kind),
])

export const mapLayers = sqliteTable('map_layers', {
  /** `mpl_` + random id. */
  id: text().primaryKey(),
  mapId: text().notNull().references(() => maps.id, { onDelete: 'cascade' }),
  key: text().notNull(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  sort: integer().notNull().default(0),
  /** Shown when the map opens. */
  visible: integer({ mode: 'boolean' }).notNull().default(true),
  /** Features can be drawn on it. */
  editable: integer({ mode: 'boolean' }).notNull().default(true),
  /** Narrows the map's visibility for this layer; `null` inherits the map's. */
  visibility: text({ mode: 'json' }).$type<Visibility>(),
}, t => [
  uniqueIndex('map_layer_key_idx').on(t.mapId, t.key),
])

export const mapFeatures = sqliteTable('map_features', {
  /** `mpf_` + random id. */
  id: text().primaryKey(),
  mapId: text().notNull().references(() => maps.id, { onDelete: 'cascade' }),
  layerId: text().notNull().references(() => mapLayers.id, { onDelete: 'cascade' }),
  /** A registered feature kind id. */
  featureKind: text().notNull(),
  geometry: text({ mode: 'json' }).$type<MapGeometry>().notNull(),
  /** Validated by the feature kind's schema. */
  properties: text({ mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  label: text({ mode: 'json' }).$type<Translated>(),
  /** Another map this feature links into (site map -> bar layout); `null` for none. No foreign key: a link may dangle. */
  linkMapId: text(),
  sort: integer().notNull().default(0),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('map_feature_map_idx').on(t.mapId),
  index('map_feature_layer_idx').on(t.layerId),
])
