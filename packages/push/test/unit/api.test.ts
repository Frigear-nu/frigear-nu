import { describe, expect, it } from 'vitest'
import { pushApi } from '../../src/runtime/utils/api'

describe('pushApi', () => {
  it('encodes ids', () => {
    expect(pushApi.me.device('psd_a/b')).toBe('/api/push/me/devices/psd_a%2Fb')
    expect(pushApi.admin.userDevices(7)).toBe('/api/admin/users/7/push-devices')
  })
})
