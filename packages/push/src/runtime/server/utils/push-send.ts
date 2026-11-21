import { db, schema } from '@nuxthub/db'
import { and, inArray, isNull } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { PushMessage, PushRuntimeConfig, SendPushResult } from '../../../types'
import { createPlatformSenders, resolvePushDriver } from '../../providers/config'
import type { PlatformSenders } from '../../providers/config'
import { deliverToDevices } from '../../providers/deliver'

const pushConfig = () => useRuntimeConfig().push as PushRuntimeConfig

// One sender per credential set, so the OAuth token (FCM) and the JWT (APNs) are reused between pushes.
let senders: { key: string, value: PlatformSenders } | undefined

function platformSenders(config: PushRuntimeConfig): PlatformSenders {
  const key = JSON.stringify([config.fcm, config.apns])
  if (senders?.key !== key) senders = { key, value: createPlatformSenders(config) }
  return senders.value
}

/**
 * Sends a push notification to every active device of `message.userIds`: FCM for Android, APNs for iOS. A device
 * whose token the provider reports as dead is revoked. Nothing here throws for a single device: failures are counted
 * (and logged) and the result tells how many devices were reached.
 *
 * With the `log` driver (the default until credentials are configured, see `push.settings.driver`) the push is only
 * written to the server log and counted as sent.
 *
 * This is a parallel API next to `@frigear-nu/notify`, which has no push driver yet: once notify implements
 * `push.driver`, this becomes that driver.
 */
export async function sendPush(_event: H3Event | undefined, message: PushMessage): Promise<SendPushResult> {
  const userIds = [...new Set(message.userIds)]
  if (!userIds.length) return { sent: 0, failed: 0, revoked: 0 }

  const devices = await db.select().from(schema.pushDevices)
    .where(and(inArray(schema.pushDevices.userId, userIds), isNull(schema.pushDevices.revokedAt)))
  if (!devices.length) return { sent: 0, failed: 0, revoked: 0 }

  const config = pushConfig()
  if (resolvePushDriver(config) === 'log') {
    for (const device of devices) {
      console.info(`[@frigear-nu/push] (log driver) ${device.platform} device ${device.id} of user ${device.userId}: ${message.title} - ${message.body}${message.url ? ` (${message.url})` : ''}`)
    }
    return { sent: devices.length, failed: 0, revoked: 0 }
  }

  const { revokedIds, problems, ...result } = await deliverToDevices(devices, {
    title: message.title,
    body: message.body,
    url: message.url,
    data: message.data,
  }, platformSenders(config))

  if (revokedIds.length) {
    await db.update(schema.pushDevices).set({ revokedAt: new Date() }).where(inArray(schema.pushDevices.id, revokedIds))
  }
  for (const problem of problems) console.warn(`[@frigear-nu/push] Delivery failed for ${problem}`)
  return result
}
