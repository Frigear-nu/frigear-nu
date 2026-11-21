import { pgTable, text, integer, serial, boolean, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

// There is deliberately no foreign key to `users` (that table is registered from another file).

// One row per app installation that can receive pushes. Registering a token that already exists moves it to the
// current user and clears `revokedAt`: a phone that changes hands belongs to whoever signed in last. A revoked row is
// kept (a dead token reported by FCM or APNs, or a device the user removed) so it is not sent to again.
export const pushDevices = pgTable('push_devices', {
  /** `psd_` + random id. */
  id: text().primaryKey(),
  userId: integer().notNull(),
  /** `ios | android | web`. */
  platform: text().notNull(),
  /** The FCM registration token (android) or the APNs device token (ios). */
  token: text().notNull().unique(),
  appId: text(),
  locale: text(),
  lastSeenAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  revokedAt: timestamp({ withTimezone: true }),
}, t => [
  index('push_device_user_idx').on(t.userId),
])

// What a user chose per notification topic (see `extendNotificationTopics`). A row is complete: it holds every
// channel, so a topic without a row uses the topic's defaults.
export const pushChannelPreferences = pgTable('push_channel_preferences', {
  id: serial().primaryKey(),
  userId: integer().notNull(),
  topic: text().notNull(),
  email: boolean().notNull(),
  sms: boolean().notNull(),
  push: boolean().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
}, t => [
  uniqueIndex('push_channel_user_topic_idx').on(t.userId, t.topic),
])
