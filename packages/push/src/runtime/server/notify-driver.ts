import type { PushDispatchResult, PushNotification } from '@frigear-nu/notify/types'
import { sendPush } from './utils/push-send'

/**
 * The push driver of `@frigear-nu/notify` (`notify.push.driver`), which this module sets as notify's default: a
 * `dispatchPushNotification` goes out through `sendPush`, FCM and APNs to the users' stored devices.
 */
export default async function pushNotifyDriver(notification: PushNotification): Promise<PushDispatchResult> {
  return sendPush(undefined, {
    userIds: notification.userIds,
    title: notification.title,
    body: notification.body,
    ...(notification.url !== undefined ? { url: notification.url } : {}),
    ...(notification.data !== undefined ? { data: notification.data } : {}),
  })
}
