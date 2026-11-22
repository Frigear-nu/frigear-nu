import type { PushPlatform, PushProvider, SendPushResult } from '../../types'
import { resolveDeviceProvider } from './config'
import type { ProviderSenders } from './config'
import type { DeviceMessage } from './types'

export type DeviceTarget = { id: string, platform: PushPlatform | string, token: string, provider?: string | null, locale?: string | null }

export type DeliveryReport = SendPushResult & {
  /** The ids of the devices whose token the provider reported as dead. */
  revokedIds: string[]
  /** The ids of the devices the provider accepted the push for (their consecutive failures reset). */
  sentIds: string[]
  /**
   * The ids of the devices the provider refused for a reason about the device (`deviceError`, or a `BadDeviceToken` that
   * was not revoked): each counts toward the device's consecutive failures. Outages, credentials and missing senders do
   * not.
   */
  failedIds: string[]
  /** One line per failed device, for the log. */
  problems: string[]
}

export type DeliveryOptions = {
  /** The provider of an iOS device that registered without one (`push.ios`). Defaults to `apns`. */
  ios?: PushProvider
}

const CONCURRENCY = 10

const providerName = (provider: PushProvider) => provider === 'fcm' ? 'FCM' : 'APNs'

/**
 * Sends `message` to every device through the sender of its provider: the one it registered with, else FCM for Android
 * and `options.ios` for iOS. An iOS device registered with an FCM token goes through FCM, which delivers to APNs itself.
 * One device failing (or having no sender) never stops the others and never throws: it is counted and described in
 * `problems`.
 */
export async function deliverToDevices(
  devices: DeviceTarget[],
  message: Omit<DeviceMessage, 'token'> | ((device: DeviceTarget) => Omit<DeviceMessage, 'token'>),
  senders: ProviderSenders,
  options: DeliveryOptions = {},
): Promise<DeliveryReport> {
  const report: DeliveryReport = { sent: 0, failed: 0, revoked: 0, revokedIds: [], sentIds: [], failedIds: [], problems: [] }
  const ios = options.ios ?? 'apns'
  // Dead tokens the provider could not tell from a wrong environment (APNs `BadDeviceToken`).
  const ambiguous: DeviceTarget[] = []

  const deliver = async (device: DeviceTarget, provider: PushProvider | undefined) => {
    const sender = provider ? senders[provider] : undefined
    if (!sender) {
      report.failed++
      report.problems.push(provider
        ? `${device.id}: no ${providerName(provider)} provider is configured (${device.platform} device)`
        : `${device.id}: no provider sends to ${device.platform} devices`)
      return
    }
    const outcome = await sender.send({ ...(typeof message === 'function' ? message(device) : message), token: device.token }).catch((error: unknown) => ({
      status: 'failed' as const,
      reason: error instanceof Error ? error.message : String(error),
    }))
    if (outcome.status === 'sent') {
      report.sent++
      report.sentIds.push(device.id)
    }
    else if (outcome.status === 'dead') {
      if (outcome.ambiguous) {
        ambiguous.push(device)
      }
      else {
        report.revoked++
        report.revokedIds.push(device.id)
      }
    }
    else {
      report.failed++
      if ('deviceError' in outcome && outcome.deviceError) report.failedIds.push(device.id)
      report.problems.push(`${device.id}: ${outcome.reason}`)
    }
  }

  const routed = devices.map(device => ({ device, provider: resolveDeviceProvider(device, ios) }))
  for (let index = 0; index < routed.length; index += CONCURRENCY) {
    await Promise.all(routed.slice(index, index + CONCURRENCY).map(({ device, provider }) => deliver(device, provider)))
  }

  // `BadDeviceToken` for every device of the call sent to APNs is most likely a sandbox token sent to production (or the
  // other way round): that says nothing about the tokens, so none is revoked. For some of them it is a dead token.
  const viaApns = routed.filter(({ provider }) => provider === 'apns').length
  const everyApnsDevice = ambiguous.length > 0 && ambiguous.length === viaApns
  for (const device of ambiguous) {
    if (everyApnsDevice) {
      report.failed++
      // Counted per device all the same: a token that keeps getting it is revoked after a few pushes in a row (the
      // usual case of one user with one iOS device, where it is the only APNs device of every call).
      report.failedIds.push(device.id)
      report.problems.push(`${device.id}: BadDeviceToken for every APNs device, not revoked: check \`push.apns.sandbox\` (sandbox and production tokens differ)`)
    }
    else {
      report.revoked++
      report.revokedIds.push(device.id)
    }
  }
  return report
}
