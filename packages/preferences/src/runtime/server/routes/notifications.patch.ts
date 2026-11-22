import { z } from 'zod'
import { validationError } from '@frigear-nu/module-kit/server'
import type { NotificationChannelsDto } from '@frigear-nu/notify/types'
import { NOTIFICATION_TOPIC_ID_MAX_LENGTH } from '@frigear-nu/notify/utils'
import { preferencesAccess } from '../../access'

const channelsSchema = z.object({ email: z.boolean(), sms: z.boolean(), push: z.boolean() }).partial().strict()
const bodySchema = z.object({ topics: z.record(z.string().min(1).max(NOTIFICATION_TOPIC_ID_MAX_LENGTH), channelsSchema) })

// `PATCH /api/preferences/notifications` (`preferences:notifications`: a session, or a token given it): changes the
// caller's channels for some topics; topics left out stay as they are. Only ever the caller's own. A topic nobody
// registered is refused (400 `validation_failed`, naming it) rather than stored. Answers every topic, like the GET. The
// choices are not in the session, so it is left alone.
export default defineEventHandler(async (event): Promise<NotificationChannelsDto> => {
  const { user } = await authorize(event, preferencesAccess.permissions.notifications)
  const { topics } = await readValidatedBody(event, bodySchema.parse)

  const unknown = Object.keys(topics).filter(id => !findNotificationTopic(id))
  if (unknown.length) {
    throw validationError(unknown.map(id => ({ code: 'custom', path: ['topics', id], message: `Unknown notification topic "${id}".` })))
  }
  const userId = Number(user.id)
  await saveNotificationChannels(userId, topics)
  return readNotificationChannels(userId)
})
