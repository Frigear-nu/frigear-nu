import type { PushPlatform, SendPushResult } from '../../types'
import type { PlatformSenders } from './config'
import type { DeviceMessage } from './types'

export type DeviceTarget = { id: string, platform: PushPlatform | string, token: string }

export type DeliveryReport = SendPushResult & {
  /** The ids of the devices whose token the provider reported as dead. */
  revokedIds: string[]
  /** One line per failed device, for the log. */
  problems: string[]
}

const CONCURRENCY = 10

/**
 * Sends `message` to every device through the sender of its platform. One device failing (or having no sender) never
 * stops the others and never throws: it is counted and described in `problems`.
 */
export async function deliverToDevices(
  devices: DeviceTarget[],
  message: Omit<DeviceMessage, 'token'>,
  senders: PlatformSenders,
): Promise<DeliveryReport> {
  const report: DeliveryReport = { sent: 0, failed: 0, revoked: 0, revokedIds: [], problems: [] }

  const deliver = async (device: DeviceTarget) => {
    const sender = device.platform === 'ios' ? senders.ios : device.platform === 'android' ? senders.android : undefined
    if (!sender) {
      report.failed++
      report.problems.push(`${device.id}: no ${device.platform} provider is configured`)
      return
    }
    const outcome = await sender.send({ ...message, token: device.token }).catch((error: unknown) => ({
      status: 'failed' as const,
      reason: error instanceof Error ? error.message : String(error),
    }))
    if (outcome.status === 'sent') {
      report.sent++
    }
    else if (outcome.status === 'dead') {
      report.revoked++
      report.revokedIds.push(device.id)
    }
    else {
      report.failed++
      report.problems.push(`${device.id}: ${outcome.reason}`)
    }
  }

  for (let index = 0; index < devices.length; index += CONCURRENCY) {
    await Promise.all(devices.slice(index, index + CONCURRENCY).map(deliver))
  }
  return report
}
