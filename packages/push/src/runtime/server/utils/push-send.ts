import { db, schema } from '@nuxthub/db'
import { and, gt, gte, inArray, isNull, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { PushMessage, PushRuntimeConfig, SendPushResult } from '../../../types'
import { chunkParams } from '@frigear-nu/module-kit/server'
import { createProviderSenders, resolveIosProvider, resolvePushDelivery } from '../../providers/config'
import type { ProviderSenders } from '../../providers/config'
import { deliverToDevices } from '../../providers/deliver'
import type { Http2Transport } from '../../providers/types'
import { readTranslated } from '@frigear-nu/notify/utils'

const pushConfig = () => useRuntimeConfig().push as PushRuntimeConfig

// One sender per credential set, so the OAuth token (FCM) and the JWT (APNs) are reused between pushes.
let senders: { key: string, value: ProviderSenders } | undefined
let http2Transport: Http2Transport | undefined

function providerSenders(config: PushRuntimeConfig): ProviderSenders {
  const key = JSON.stringify([config.fcm, config.apns, config.timeoutMs])
  if (senders?.key !== key) senders = { key, value: createProviderSenders(config, { http2: http2Transport }) }
  return senders.value
}

/**
 * Replaces the transport APNs requests go through (`node:http2` by default). For a relay on a runtime without an HTTP/2
 * client (Cloudflare Workers: call it from a Nitro plugin), and for tests. `undefined` restores the default.
 */
export function setPushHttp2Transport(transport: Http2Transport | undefined): void {
  http2Transport = transport
  senders = undefined
}

let warnedLogDriver = false
let warnedConfig: string | undefined

/** Logs a configuration error once per message, so a bad setting does not flood the log on every push. */
function reportConfigError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).replace(/^\[@frigear-nu\/push\] /, '')
  if (warnedConfig === message) return
  warnedConfig = message
  console.error(`[@frigear-nu/push] Pushes cannot be sent until the push settings are fixed: ${message}`)
}

/**
 * Sends a push notification to every active device of `message.userIds`: FCM for Android, and for iOS FCM or APNs (over
 * HTTP/2), whichever issued the device's token (`push.ios` for a device that did not say). A device whose token the
 * provider reports as dead is revoked. Nothing here throws for a single device: failures are counted (and logged) and
 * the result tells how many devices were reached. Invalid settings (`push.delivery`, `push.ios`, the FCM service
 * account) do not throw either: they are logged once and every device counts as failed.
 *
 * `title` and `body` can be one text per locale: each device gets the text for the locale it registered with.
 *
 * With the `log` delivery (the default until credentials are configured, see `push.settings.delivery`) the push is only
 * written to the server log (title and user id, never the body) and counted as sent.
 *
 * Feature code sends push through notify's `dispatchPushNotification`: this module is notify's push driver
 * (`runtime/server/notify-driver.ts`), which calls this. `sendPush` stays for push's own routes.
 */
export async function sendPush(_event: H3Event | undefined, message: PushMessage): Promise<SendPushResult> {
  const userIds = [...new Set(message.userIds)]
  if (!userIds.length) return { sent: 0, failed: 0, revoked: 0 }

  // Chunked: D1 allows 100 bound parameters per query.
  const devices = (await Promise.all(chunkParams(userIds).map(ids => db.select().from(schema.pushDevices)
    .where(and(inArray(schema.pushDevices.userId, ids), isNull(schema.pushDevices.revokedAt)))))).flat()
  if (!devices.length) return { sent: 0, failed: 0, revoked: 0 }

  const text = (value: PushMessage['title'], locale: string | null) => readTranslated(value, locale ?? 'en')
  const config = pushConfig()
  let delivery: 'log' | 'providers'
  let route: { senders: ProviderSenders, ios: ReturnType<typeof resolveIosProvider> } | undefined
  try {
    delivery = resolvePushDelivery(config)
    if (delivery === 'providers') route = { senders: providerSenders(config), ios: resolveIosProvider(config) }
  }
  catch (error) {
    reportConfigError(error)
    return { sent: 0, failed: devices.length, revoked: 0 }
  }
  if (delivery === 'log') {
    if (!warnedLogDriver && process.env.NODE_ENV === 'production') {
      warnedLogDriver = true
      console.warn('[@frigear-nu/push] The log delivery is active in production: pushes are only logged, not sent. Set the FCM / APNs credentials (NUXT_PUSH_*) or `push.settings.delivery`.')
    }
    for (const device of devices) {
      console.info(`[@frigear-nu/push] (log delivery) push "${text(message.title, device.locale)}" to user ${device.userId}, ${device.platform} device ${device.id}`)
    }
    return { sent: devices.length, failed: 0, revoked: 0 }
  }

  const { revokedIds, sentIds, failedIds, problems, ...result } = await deliverToDevices(devices, device => ({
    title: text(message.title, device.locale ?? null),
    body: text(message.body, device.locale ?? null),
    url: message.url,
    data: message.data,
  }), route!.senders, { ios: route!.ios })

  for (const ids of chunkParams(revokedIds)) {
    await db.update(schema.pushDevices).set({ revokedAt: new Date() }).where(inArray(schema.pushDevices.id, ids))
  }
  const worn = await countPushDeviceOutcomes(sentIds, failedIds)
  for (const problem of problems) console.warn(`[@frigear-nu/push] Delivery failed for ${problem}`)
  return { ...result, failed: result.failed - worn, revoked: result.revoked + worn }
}

/** Consecutive refused pushes after which a device is revoked (`push_devices.failures`). */
export const PUSH_DEVICE_FAILURE_LIMIT = 3

/**
 * Keeps the consecutive-failure counter of each device: a device the provider accepted starts again at 0, one it refused
 * (`failedIds` of the delivery) counts one up and is revoked when it reaches {@link PUSH_DEVICE_FAILURE_LIMIT}. Returns how
 * many devices were revoked now. Registering the device again clears both.
 */
export async function countPushDeviceOutcomes(sentIds: readonly string[], failedIds: readonly string[]): Promise<number> {
  const table = schema.pushDevices
  for (const ids of chunkParams([...sentIds])) {
    await db.update(table).set({ failures: 0 }).where(and(inArray(table.id, ids), gt(table.failures, 0)))
  }
  let revoked = 0
  for (const ids of chunkParams([...failedIds])) {
    await db.update(table).set({ failures: sql`${table.failures} + 1` }).where(inArray(table.id, ids))
    const rows = await db.update(table).set({ revokedAt: new Date() })
      .where(and(inArray(table.id, ids), gte(table.failures, PUSH_DEVICE_FAILURE_LIMIT), isNull(table.revokedAt)))
      .returning({ id: table.id })
    revoked += rows.length
  }
  return revoked
}
