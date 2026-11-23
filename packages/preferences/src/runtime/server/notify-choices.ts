import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { NotificationChoices, NotifyChoicesStore } from '@frigear-nu/notify/types'
import { NOTIFICATION_CHOICES_KEY } from '../notifications'
import { applyPreferencePatch, readPreference } from '../utils/registry'
import { getPreferenceRegistry } from './utils/preferences'

// The choices store of `@frigear-nu/notify` (registered in `module.ts`): a user's channels per notification topic, kept
// in the `notificationChannels` preference on `users.preferences`, so no table of its own.

async function storedPreferences(userId: number) {
  const [row] = await db.select({ preferences: schema.users.preferences }).from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  return row
}

const store: NotifyChoicesStore = {
  async readChoices(userId) {
    const row = await storedPreferences(userId)
    return (readPreference(getPreferenceRegistry(), row?.preferences, NOTIFICATION_CHOICES_KEY) as NotificationChoices | undefined) ?? {}
  },

  // Merges per channel against a read made here, right before the write (not the caller's earlier one), so a change to
  // another channel or topic that landed in between is kept.
  async writeChoices(userId, choices) {
    const row = await storedPreferences(userId)
    if (!row) return
    const current = (readPreference(getPreferenceRegistry(), row.preferences, NOTIFICATION_CHOICES_KEY) as NotificationChoices | undefined) ?? {}
    const merged: NotificationChoices = { ...current }
    for (const [topic, channels] of Object.entries(choices)) merged[topic] = { ...current[topic], ...channels }
    const next = getPreferenceRegistry().get(NOTIFICATION_CHOICES_KEY)!.schema.parse(merged)
    await db.update(schema.users)
      .set({ preferences: applyPreferencePatch(row.preferences, { [NOTIFICATION_CHOICES_KEY]: next }) })
      .where(eq(schema.users.id, userId))
  },
}

export default store
