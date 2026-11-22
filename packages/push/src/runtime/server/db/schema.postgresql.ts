import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core'

// There is deliberately no foreign key to `users` (that table is registered from another file).

// One row per app installation that can receive pushes, bound to the installation's secret (only its hash is stored).
// Registering a token that already exists keeps it with its user, and moves it to another user only when the request
// carries the installation's secret (a phone that changes hands); otherwise 409 `device_owned`. A device the user removes
// is deleted; a row is revoked when FCM or APNs report its token dead, or after `PUSH_DEVICE_FAILURE_LIMIT` refused
// pushes in a row, and is kept so it is not sent to again. Registering again clears both.
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
  /** SHA-256 (hex) of the installation secret the app generated; `null` for a row registered without one. */
  secretHash: text(),
  /** Pushes the provider refused for this device in a row (0 after a delivered one): revoked at the limit. */
  failures: integer().notNull().default(0),
}, t => [
  index('push_device_user_idx').on(t.userId),
])
