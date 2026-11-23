import { z } from 'zod'
import { NOTIFICATION_TOPIC_ID_MAX_LENGTH } from '@frigear-nu/notify/utils'
import { definePreferences } from './define'

// The preference notify's choices store (`server/notify-choices.ts`) keeps the user's channels per notification topic
// in. A topic is only stored once the user changed it. The preference is `managed`, so it stays out of the session
// cookie (`server/session-filter.ts`) and has no cap on the number of topics.

/** The preference key the channel choices are stored under. */
export const NOTIFICATION_CHOICES_KEY = 'notificationChannels'

const channels = z.object({ email: z.boolean(), sms: z.boolean(), push: z.boolean() }).partial().strict()

export const notificationChoicesSchema = z.record(z.string().min(1).max(NOTIFICATION_TOPIC_ID_MAX_LENGTH), channels)

// The key is `NOTIFICATION_CHOICES_KEY`, written out so the generated `UserPreferences` type knows it. `managed`: the
// choices change only through `PATCH /api/preferences/notifications`, which checks the topics against notify's registry,
// and never ride in the session.
export default definePreferences({
  notificationChannels: { schema: notificationChoicesSchema, managed: true },
})
