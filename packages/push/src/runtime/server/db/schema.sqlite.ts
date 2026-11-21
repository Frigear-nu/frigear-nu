import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

// There is deliberately no foreign key to `users` (that table is registered from another file).

// One row per app installation that can receive pushes. Registering a token that already exists moves it to the
// current user and clears `revokedAt`: a phone that changes hands belongs to whoever signed in last. A device the user
// removes is deleted; a row is revoked only when FCM or APNs report its token dead, and is kept so it is not sent to again.
export const pushDevices = sqliteTable('push_devices', {
  /** `psd_` + random id. */
  id: text().primaryKey(),
  userId: integer().notNull(),
  /** `ios | android | web`. */
  platform: text().notNull(),
  /** The FCM registration token (android) or the APNs device token (ios). */
  token: text().notNull().unique(),
  appId: text(),
  locale: text(),
  lastSeenAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  revokedAt: integer({ mode: 'timestamp' }),
}, t => [
  index('push_device_user_idx').on(t.userId),
])

// What a user chose per notification topic (see `extendNotificationTopics`). A row is complete: it holds every
// channel, so a topic without a row uses the topic's defaults.
export const pushChannelPreferences = sqliteTable('push_channel_preferences', {
  id: integer().primaryKey({ autoIncrement: true }),
  userId: integer().notNull(),
  topic: text().notNull(),
  email: integer({ mode: 'boolean' }).notNull(),
  sms: integer({ mode: 'boolean' }).notNull(),
  push: integer({ mode: 'boolean' }).notNull(),
  updatedAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('push_channel_user_topic_idx').on(t.userId, t.topic),
])
