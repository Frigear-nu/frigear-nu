import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// A recurring period or fixed range, see `@frigear-nu/module-kit/schedule`.
type Schedule = import('@frigear-nu/module-kit/schedule').Schedule
// Where the operation takes place, see `OperationLocation` in types.ts.
type OperationLocation = { name: Translated, address?: string, lat?: number, lng?: number }

export const operations = sqliteTable('operations', {
  /** `opr_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  description: text({ mode: 'json' }).$type<Translated>(),
  /** Who hosts the occasion: Frigear, or the festival or venue Frigear works at. */
  hostName: text(),
  hostUrl: text(),
  startsAt: integer({ mode: 'timestamp' }).notNull(),
  endsAt: integer({ mode: 'timestamp' }),
  /** When the occasion runs, if it is more than the one period above. */
  schedule: text({ mode: 'json' }).$type<Schedule>(),
  location: text({ mode: 'json' }).$type<OperationLocation>(),
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
