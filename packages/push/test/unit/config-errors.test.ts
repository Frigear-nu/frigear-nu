import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PushRuntimeConfig } from '../../src/types'

// sendPush and registerPushDevice against a stand-in database, with settings an operator got wrong: they must count the
// devices as failed (or fall back) and never throw, so notifyUser and device registration keep working.

const devices = [
  { id: 'psd_a', userId: 1, platform: 'android', token: 'tok-a', provider: 'fcm', appId: null, locale: 'en', lastSeenAt: new Date(), createdAt: new Date(), revokedAt: null },
  { id: 'psd_i', userId: 1, platform: 'ios', token: 'tok-i', provider: null, appId: null, locale: 'da', lastSeenAt: new Date(), createdAt: new Date(), revokedAt: null },
]
const inserted = vi.hoisted(() => ({ values: undefined as Record<string, unknown> | undefined }))

vi.mock('@nuxthub/db', () => {
  const where = async () => devices
  const returning = async () => [{ ...devices[1], ...inserted.values }]
  return {
    schema: { pushDevices: { userId: 'userId', revokedAt: 'revokedAt', token: 'token', id: 'id' } },
    db: {
      select: () => ({ from: () => ({ where }) }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          inserted.values = values
          return { onConflictDoUpdate: () => ({ returning }) }
        },
      }),
    },
  }
})
vi.mock('drizzle-orm', () => ({ and: () => ({}), eq: () => ({}), inArray: () => ({}), isNull: () => ({}), desc: () => ({}) }))

const valid: PushRuntimeConfig = {
  delivery: 'log',
  timeoutMs: 10000,
  ios: '',
  fcm: { serviceAccount: '' },
  apns: { keyId: '', teamId: '', topic: '', privateKey: '', sandbox: false },
}

function settings(overrides: Partial<PushRuntimeConfig>) {
  vi.stubGlobal('useRuntimeConfig', () => ({ push: { ...valid, ...overrides } }))
}

describe('push with invalid settings', () => {
  let error: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.stubGlobal('useNitroApp', () => ({ hooks: { callHook: async () => {} } }))
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends through the log delivery with usable settings', async () => {
    const { sendPush } = await import('../../src/runtime/server/utils/push-send')
    settings({})
    await expect(sendPush(undefined, { userIds: [1], title: 'Hi', body: 'There' })).resolves.toEqual({ sent: 2, failed: 0, revoked: 0 })
  })

  it('counts every device as failed and logs once, for each invalid setting', async () => {
    const { sendPush } = await import('../../src/runtime/server/utils/push-send')
    for (const bad of [{ delivery: 'sns' }, { delivery: 'providers', ios: 'carrier-pigeon' }, { delivery: 'providers', fcm: { serviceAccount: '{not json' } }]) {
      settings(bad)
      error.mockClear()
      await expect(sendPush(undefined, { userIds: [1], title: 'Hi', body: 'There' }), JSON.stringify(bad)).resolves.toEqual({ sent: 0, failed: 2, revoked: 0 })
      await expect(sendPush(undefined, { userIds: [1], title: 'Hi', body: 'There' })).resolves.toEqual({ sent: 0, failed: 2, revoked: 0 })
      expect(error).toHaveBeenCalledTimes(1)
    }
  })

  it('ignores push.ios for the log delivery', async () => {
    const { sendPush } = await import('../../src/runtime/server/utils/push-send')
    settings({ ios: 'carrier-pigeon' })
    await expect(sendPush(undefined, { userIds: [1], title: 'Hi', body: 'There' })).resolves.toEqual({ sent: 2, failed: 0, revoked: 0 })
  })

  it('registers an iOS device on an invalid push.ios, with the default provider', async () => {
    const { registerPushDevice } = await import('../../src/runtime/server/utils/push-devices')
    settings({ ios: 'carrier-pigeon' })
    const device = await registerPushDevice({} as never, 1, { platform: 'ios', token: 'tok-new' })
    expect(inserted.values).toMatchObject({ platform: 'ios', provider: 'apns' })
    expect(device).toMatchObject({ platform: 'ios', provider: 'apns' })
  })
})
