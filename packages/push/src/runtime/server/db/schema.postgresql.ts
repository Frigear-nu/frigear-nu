import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core'

// There is deliberately no foreign key to `users` (that table is registered from another file).

// One row per app installation that can receive pushes. Registering a token that already exists moves it to the
// current user and clears `revokedAt`: a phone that changes hands belongs to whoever signed in last. A device the user
// removes is deleted; a row is revoked only when FCM or APNs report its token dead, and is kept so it is not sent to again.
export const pushDevices = pgTable('push_devices', {
  /** `psd_` + random id. */
  id: text().primaryKey(),
  userId: integer().notNull(),
  /** `ios | android | web`. */
  platform: text().notNull(),
  /** The FCM registration token (android, and ios through FCM) or the APNs device token (ios through APNs). */
  token: text().notNull().unique(),
  /**
   * `fcm | apns`: who issued the token, so where its pushes go. `null` for a row registered before the column existed:
   * android is FCM and ios follows `push.ios`.
   */
  provider: text(),
  appId: text(),
  locale: text(),
  lastSeenAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
  revokedAt: timestamp({ withTimezone: true }),
}, t => [
  index('push_device_user_idx').on(t.userId),
])
