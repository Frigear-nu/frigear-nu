import type { NotificationChannelsDto } from '@frigear-nu/notify/types'
import { preferencesAccess } from '../../access'

// `GET /api/preferences/notifications` (`preferences:notifications`: a session, or a token given it): every
// notification topic with the channels that apply to the caller (their choice, or the topic's defaults). Only ever the
// caller's own.
export default defineEventHandler(async (event): Promise<NotificationChannelsDto> => {
  const { user } = await authorize(event, preferencesAccess.permissions.notifications)
  return readNotificationChannels(Number(user.id))
})
