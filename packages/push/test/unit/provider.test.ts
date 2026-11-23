import { describe, expect, it } from 'vitest'
import { pushDeviceProvider } from '../../src/runtime/utils/provider'

describe('pushDeviceProvider', () => {
  it('shows the provider a device registered with, FCM for Android, and nothing the device did not say', () => {
    expect(pushDeviceProvider({ platform: 'ios', provider: 'fcm' })).toBe('fcm')
    expect(pushDeviceProvider({ platform: 'ios', provider: 'apns' })).toBe('apns')
    expect(pushDeviceProvider({ platform: 'android', provider: null })).toBe('fcm')
    // An iOS device from before providers were stored goes where the server's `push.ios` says.
    expect(pushDeviceProvider({ platform: 'ios', provider: null })).toBeNull()
    expect(pushDeviceProvider({ platform: 'web', provider: null })).toBeNull()
  })
})
