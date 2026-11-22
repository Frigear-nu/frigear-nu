import type { PushDeviceDto, PushProvider } from '../../types'

/**
 * Who a device's pushes go to, as far as the device tells: the provider it registered with, else FCM on Android (its
 * only provider). `null` for an iOS device registered before providers were stored (the server's `push.ios` decides)
 * and for the web.
 */
export function pushDeviceProvider(device: Pick<PushDeviceDto, 'platform' | 'provider'>): PushProvider | null {
  if (device.provider) return device.provider
  return device.platform === 'android' ? 'fcm' : null
}
