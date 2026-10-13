import { sqliteTable, text, integer, index, uniqueIndex, customType } from 'drizzle-orm/sqlite-core'

// Texts that can be shown in several languages are stored as json: either a plain string, or a
// `{ da: '...', en: '...' }` map (see `Translated` in types.ts).
// (declared here, not imported: this file is merged into the generated schema as plain text)
type Translated = string | Record<string, string>
// A recurring sale season or fixed range, see `@frigear-nu/module-kit/schedule`.
type Schedule = import('@frigear-nu/module-kit/schedule').Schedule

export const events = sqliteTable('events', {
  /** `evn_` + random id. */
  id: text().primaryKey(),
  slug: text().notNull().unique(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  description: text({ mode: 'json' }).$type<Translated>(),
  /** Markdown body (per locale). */
  body: text({ mode: 'json' }).$type<Translated>(),
  image: text(),
  // A plain `text` column that also holds a `Translated`: strings are stored as they are (so rows written before
  // locations could be translated keep working), per-locale maps as json. No schema change, hence no migration.
  // Kept inline: module-kit lifts each table's columns into the host schema, so helpers declared above would be lost.
  location: customType<{ data: Translated, driverData: string }>({
    dataType: () => 'text',
    toDriver: value => (typeof value === 'string' ? value : JSON.stringify(value)),
    fromDriver: (value) => {
      if (value.startsWith('{')) {
        try {
          const parsed: unknown = JSON.parse(value)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, string>
        }
        catch { /* a plain text that happens to start with a brace */ }
      }
      return value
    },
  })(),
  locationUrl: text(),
  startsAt: integer({ mode: 'timestamp' }).notNull(),
  endsAt: integer({ mode: 'timestamp' }),
  /** `draft | published | archived`. Only published events are public. */
  status: text().notNull().default('draft'),
  /** Same shape as `requiresMembership` on a ticket type; applies to every ticket of the event. */
  requiresMembership: text({ mode: 'json' }).$type<'any' | string[]>(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('event_status_starts_idx').on(t.status, t.startsAt),
])

export const eventTicketTypes = sqliteTable('event_ticket_types', {
  /** `ttp_` + random id. */
  id: text().primaryKey(),
  eventId: text().notNull().references(() => events.id, { onDelete: 'cascade' }),
  /** Stable key within the event (e.g. `default`, `premium`). */
  key: text().notNull(),
  name: text({ mode: 'json' }).$type<Translated>().notNull(),
  description: text({ mode: 'json' }).$type<Translated>(),
  /** Price in minor units; `0` is a free ticket. */
  price: integer().notNull().default(0),
  currency: text().notNull().default('DKK'),
  hidePrice: integer({ mode: 'boolean' }).notNull().default(false),
  /** Maximum number of sold + reserved tickets; null = unlimited. */
  capacity: integer(),
  saleStartsAt: integer({ mode: 'timestamp' }),
  saleEndsAt: integer({ mode: 'timestamp' }),
  /** Optional recurring sale season (`yearly`) or fixed `range`, checked on top of `saleStartsAt`/`saleEndsAt`; null = always. */
  saleSchedule: text({ mode: 'json' }).$type<Schedule>(),
  maxPerUser: integer().notNull().default(1),
  /** `null` = open to everyone, `'any'` = any active subscription, or a list of plan keys. */
  requiresMembership: text({ mode: 'json' }).$type<'any' | string[]>(),
  /**
   * The opposite: holders of these plans can NOT buy this ticket (`'any'` = any active subscription), so a
   * member price and a non-member price can be separate ticket types. `null` = nobody is excluded.
   */
  excludesMembership: text({ mode: 'json' }).$type<'any' | string[]>(),
  isDefault: integer({ mode: 'boolean' }).notNull().default(false),
  sortOrder: integer().notNull().default(0),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('event_ticket_type_key_idx').on(t.eventId, t.key),
])

export const eventAddonGroups = sqliteTable('event_addon_groups', {
  /** `agr_` + random id. */
  id: text().primaryKey(),
  ticketTypeId: text().notNull().references(() => eventTicketTypes.id, { onDelete: 'cascade' }),
  title: text({ mode: 'json' }).$type<Translated>().notNull(),
  /** When true, at least one addon of the group must be chosen. */
  required: integer({ mode: 'boolean' }).notNull().default(false),
  /** When false (the default) at most one addon of the group can be chosen. */
  multiple: integer({ mode: 'boolean' }).notNull().default(false),
  sortOrder: integer().notNull().default(0),
}, t => [
  index('event_addon_group_ticket_idx').on(t.ticketTypeId),
])

export const eventAddons = sqliteTable('event_addons', {
  /** `adn_` + random id. */
  id: text().primaryKey(),
  groupId: text().notNull().references(() => eventAddonGroups.id, { onDelete: 'cascade' }),
  label: text({ mode: 'json' }).$type<Translated>().notNull(),
  description: text({ mode: 'json' }).$type<Translated>(),
  /** Price in minor units, in the ticket type's currency; `0` is included in the ticket. */
  price: integer().notNull().default(0),
  /** Maximum number of sold + reserved addons; null = unlimited. */
  capacity: integer(),
  sortOrder: integer().notNull().default(0),
}, t => [
  index('event_addon_group_idx').on(t.groupId),
])

// A purchased (or reserved) ticket. Amounts and the chosen addons are snapshotted so later edits to
// prices never change what somebody bought. No foreign keys: purchased tickets must outlive edits
// or removal of the catalogue rows.
export const eventTickets = sqliteTable('event_tickets', {
  /** `tkt_` + random id. */
  id: text().primaryKey(),
  eventId: text().notNull(),
  ticketTypeId: text().notNull(),
  userId: integer().notNull(),
  /** The payment that covers it; null for free tickets. */
  paymentId: text(),
  /** `pending | paid | cancelled | refunded | expired`. `pending` and `paid` hold a seat. */
  status: text().notNull().default('pending'),
  addons: text({ mode: 'json' }).$type<Array<{ id: string, label: Translated, price: number }>>().notNull(),
  amount: integer().notNull(),
  currency: text().notNull(),
  /** Unguessable value shown as a QR code and scanned at check-in. */
  code: text().notNull().unique(),
  /** Language the buyer was browsing in; used for mails and payment texts after the purchase. */
  locale: text(),
  checkedInAt: integer({ mode: 'timestamp' }),
  checkedInBy: integer(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  index('event_ticket_event_idx').on(t.eventId, t.status),
  index('event_ticket_user_idx').on(t.userId),
  index('event_ticket_payment_idx').on(t.paymentId),
])
