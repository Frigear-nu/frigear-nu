import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// One row per short link. `code` is the path segment of `/<path>/:code` (random base62 or a vanity slug, matched
// case-sensitively). The owner is the module that made the link (`ownerModule`, `short-links` for links made on the
// admin page) and optionally its record (`ownerRefId`), so the owner can disable its links in one call.
// `createdBy` has deliberately no foreign key to `users` (that table is registered from another module).
export const shortLinks = sqliteTable('short_links', {
  /** `shl_` + random id. */
  id: text().primaryKey(),
  code: text().notNull(),
  /** The target, an `http(s)` URL. */
  url: text().notNull(),
  ownerModule: text().notNull(),
  ownerRefId: text(),
  title: text(),
  /** Store a `short_link_clicks` row per click. The counter and the `short-links:clicked` hook work either way. */
  track: integer({ mode: 'boolean' }).notNull().default(true),
  expiresAt: integer({ mode: 'timestamp' }),
  disabledAt: integer({ mode: 'timestamp' }),
  clicks: integer().notNull().default(0),
  lastClickedAt: integer({ mode: 'timestamp' }),
  createdBy: integer(),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('short_links_code_idx').on(t.code),
  index('short_links_owner_idx').on(t.ownerModule, t.ownerRefId),
  index('short_links_created_idx').on(t.createdAt),
])

// One row per counted click of a link with `track` on. No IP address or user agent is stored; `subject` is the opaque
// segment after the code (e.g. a campaign delivery token), `referrerHost` only the host of the `Referer`.
export const shortLinkClicks = sqliteTable('short_link_clicks', {
  id: integer().primaryKey({ autoIncrement: true }),
  linkId: text().notNull().references(() => shortLinks.id, { onDelete: 'cascade' }),
  at: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  subject: text(),
  referrerHost: text(),
}, t => [
  index('short_link_clicks_link_idx').on(t.linkId, t.at),
  index('short_link_clicks_at_idx').on(t.at),
])
