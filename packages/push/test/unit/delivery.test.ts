import { describe, expect, it } from 'vitest'
import { deliverToDevices } from '../../src/runtime/providers/deliver'
import { chunk } from '../../src/runtime/providers/chunk'
import { apnsConfigOf, createProviderSenders, hasApnsCredentials, hasFcmCredentials, isApnsSandbox, requestTimeoutMs, resolveDeviceProvider, resolveIosProvider, resolvePushDriver } from '../../src/runtime/providers/config'
import type { PushRuntimeConfig } from '../../src/types'
import type { DeviceSender } from '../../src/runtime/providers/types'

const config = (overrides: Partial<PushRuntimeConfig> = {}): PushRuntimeConfig => ({
  driver: '',
  timeoutMs: 10000,
  ios: '',
  fcm: { serviceAccount: '' },
  apns: { keyId: '', teamId: '', topic: '', privateKey: '', sandbox: false },
  ...overrides,
})

describe('resolvePushDriver', () => {
  it('logs until credentials are configured, then uses the providers', () => {
    expect(resolvePushDriver(config())).toBe('log')
    expect(resolvePushDriver(config({ fcm: { serviceAccount: '{}' } }))).toBe('providers')
    expect(resolvePushDriver(config({ apns: { keyId: 'k', teamId: 't', topic: 'a', privateKey: 'p', sandbox: false } }))).toBe('providers')
    // APNs needs every part.
    expect(resolvePushDriver(config({ apns: { keyId: 'k', teamId: '', topic: 'a', privateKey: 'p', sandbox: false } }))).toBe('log')
  })

  it('lets an explicit driver win and refuses an unknown one', () => {
    expect(resolvePushDriver(config({ driver: 'log', fcm: { serviceAccount: '{}' } }))).toBe('log')
    expect(resolvePushDriver(config({ driver: 'providers' }))).toBe('providers')
    expect(() => resolvePushDriver(config({ driver: 'sns' }))).toThrow(/log" or "providers/)
  })

  it('reads credentials and the sandbox flag from env style values', () => {
    expect(hasFcmCredentials(config({ fcm: { serviceAccount: '  ' } }))).toBe(false)
    expect(hasApnsCredentials(config())).toBe(false)
    expect([true, 'true', 'TRUE', '1', 'yes'].map(isApnsSandbox)).toEqual([true, true, true, true, true])
    expect([false, 'false', '', undefined, '0'].map(isApnsSandbox)).toEqual([false, false, false, false, false])
    expect(apnsConfigOf(config({ apns: { keyId: ' k ', teamId: 't', topic: 'a', privateKey: 'p', sandbox: 'true' } }))).toMatchObject({ keyId: 'k', sandbox: true })
  })

  it('reads push.ios, APNs unless set, and refuses anything else', () => {
    expect(resolveIosProvider(config())).toBe('apns')
    expect(resolveIosProvider(config({ ios: ' FCM ' }))).toBe('fcm')
    expect(resolveIosProvider(config({ ios: 'apns' }))).toBe('apns')
    expect(() => resolveIosProvider(config({ ios: 'sns' }))).toThrow(/"fcm" or "apns"/)
  })

  it('routes a device to the provider it registered with, else by platform', () => {
    expect(resolveDeviceProvider({ platform: 'ios', provider: 'fcm' }, 'apns')).toBe('fcm')
    expect(resolveDeviceProvider({ platform: 'ios', provider: 'apns' }, 'fcm')).toBe('apns')
    expect(resolveDeviceProvider({ platform: 'ios', provider: null }, 'fcm')).toBe('fcm')
    expect(resolveDeviceProvider({ platform: 'ios' }, 'apns')).toBe('apns')
    expect(resolveDeviceProvider({ platform: 'android', provider: null }, 'apns')).toBe('fcm')
    expect(resolveDeviceProvider({ platform: 'android', provider: 'unknown' }, 'apns')).toBe('fcm')
    expect(resolveDeviceProvider({ platform: 'web' }, 'apns')).toBeUndefined()
  })

  it('creates a sender per configured provider only', () => {
    expect(createProviderSenders(config())).toEqual({ fcm: undefined, apns: undefined })
    const senders = createProviderSenders(config({ apns: { keyId: 'k', teamId: 't', topic: 'a', privateKey: 'p', sandbox: false } }))
    expect(senders.apns).toBeDefined()
    expect(senders.fcm).toBeUndefined()
  })
})

describe('deliverToDevices', () => {
  const sender = (answer: (token: string) => ReturnType<DeviceSender['send']>): DeviceSender => ({ send: ({ token }) => answer(token) })
  const message = { title: 'Hi', body: 'There' }

  it('counts sent, failed and dead devices and never throws for one of them', async () => {
    const report = await deliverToDevices([
      { id: 'a', platform: 'android', token: 'ok' },
      { id: 'b', platform: 'android', token: 'dead' },
      { id: 'c', platform: 'ios', token: 'broken' },
      { id: 'd', platform: 'ios', token: 'throws' },
      { id: 'e', platform: 'web', token: 'web' },
    ], message, {
      fcm: sender(async token => token === 'dead' ? { status: 'dead', reason: '404' } : { status: 'sent' }),
      apns: sender(async (token) => {
        if (token === 'throws') throw new Error('boom')
        return { status: 'failed', reason: '500' }
      }),
    })
    expect(report).toMatchObject({ sent: 1, failed: 3, revoked: 1, revokedIds: ['b'] })
    expect([...report.problems].sort()).toEqual(['c: 500', 'd: boom', 'e: no provider sends to web devices'])
  })

  it('reports a platform without a provider as failed', async () => {
    const report = await deliverToDevices([{ id: 'a', platform: 'ios', token: 't' }], message, {})
    expect(report).toMatchObject({ sent: 0, failed: 1, revoked: 0 })
    expect(report.problems).toEqual(['a: no APNs provider is configured (ios device)'])
  })

  // The fix for Cloudflare Workers: an iOS device registered with its FCM token never needs APNs (HTTP/2).
  it('sends an iOS device registered with an FCM token through FCM, whatever push.ios says', async () => {
    const seen: Array<[string, string]> = []
    const record = (provider: string) => sender(async (token) => {
      seen.push([provider, token])
      return { status: 'sent' }
    })
    const report = await deliverToDevices([
      { id: 'a', platform: 'ios', token: 'ios-fcm', provider: 'fcm' },
      { id: 'b', platform: 'ios', token: 'ios-apns', provider: 'apns' },
      { id: 'c', platform: 'android', token: 'android', provider: 'fcm' },
    ], message, { fcm: record('fcm'), apns: record('apns') }, { ios: 'apns' })
    expect(report).toMatchObject({ sent: 3, failed: 0 })
    expect(seen.sort()).toEqual([['apns', 'ios-apns'], ['fcm', 'android'], ['fcm', 'ios-fcm']])
  })

  it('reaches an iOS FCM device with only FCM configured (no APNs credentials, no HTTP/2)', async () => {
    const report = await deliverToDevices([{ id: 'a', platform: 'ios', token: 'ios-fcm', provider: 'fcm' }], message, { fcm: sender(async () => ({ status: 'sent' })) })
    expect(report).toMatchObject({ sent: 1, failed: 0, problems: [] })
  })

  it('sends iOS devices that did not say through push.ios (APNs by default), Android always through FCM', async () => {
    const seen: string[] = []
    const record = (provider: string) => sender(async (token) => {
      seen.push(`${provider}:${token}`)
      return { status: 'sent' }
    })
    const devices = [
      { id: 'a', platform: 'ios', token: 'ios', provider: null },
      { id: 'b', platform: 'android', token: 'android' },
    ]
    await deliverToDevices(devices, message, { fcm: record('fcm'), apns: record('apns') })
    expect(seen.sort()).toEqual(['apns:ios', 'fcm:android'])
    seen.length = 0
    await deliverToDevices(devices, message, { fcm: record('fcm'), apns: record('apns') }, { ios: 'fcm' })
    expect(seen.sort()).toEqual(['fcm:android', 'fcm:ios'])
  })

  it('ignores FCM devices when deciding whether every APNs device got BadDeviceToken', async () => {
    const report = await deliverToDevices([
      { id: 'a', platform: 'ios', token: 'bad', provider: 'apns' },
      { id: 'b', platform: 'ios', token: 'ok', provider: 'fcm' },
    ], message, {
      apns: sender(async () => ({ status: 'dead', reason: '400 BadDeviceToken', ambiguous: true })),
      fcm: sender(async () => ({ status: 'sent' })),
    })
    // The only APNs device got it: a sandbox or production mix-up, so it is not revoked.
    expect(report).toMatchObject({ sent: 1, failed: 1, revoked: 0 })
  })

  it('sends to many devices in batches', async () => {
    const devices = Array.from({ length: 25 }, (_, index) => ({ id: `d${index}`, platform: 'android', token: `t${index}` }))
    let concurrent = 0
    let peak = 0
    const report = await deliverToDevices(devices, message, {
      fcm: sender(async () => {
        peak = Math.max(peak, ++concurrent)
        await new Promise(resolve => setTimeout(resolve, 1))
        concurrent--
        return { status: 'sent' }
      }),
    })
    expect(report.sent).toBe(25)
    expect(peak).toBeLessThanOrEqual(10)
  })

  it('does not revoke when every iOS device of the call gets BadDeviceToken (a sandbox or production mix-up)', async () => {
    const bad = sender(async () => ({ status: 'dead', reason: '400 BadDeviceToken', ambiguous: true }))
    const report = await deliverToDevices([
      { id: 'a', platform: 'ios', token: '1' },
      { id: 'b', platform: 'ios', token: '2' },
      { id: 'c', platform: 'android', token: '3' },
    ], message, { apns: bad, fcm: sender(async () => ({ status: 'sent' })) })
    expect(report).toMatchObject({ sent: 1, failed: 2, revoked: 0, revokedIds: [] })
    expect(report.problems[0]).toContain('push.apns.sandbox')
  })

  it('revokes a BadDeviceToken when other iOS devices of the call were fine', async () => {
    const report = await deliverToDevices([
      { id: 'a', platform: 'ios', token: 'bad' },
      { id: 'b', platform: 'ios', token: 'ok' },
    ], message, { apns: sender(async token => token === 'bad' ? { status: 'dead', reason: '400 BadDeviceToken', ambiguous: true } : { status: 'sent' }) })
    expect(report).toMatchObject({ sent: 1, failed: 0, revoked: 1, revokedIds: ['a'] })
  })

  it('still revokes an unambiguous dead token when every iOS device is dead', async () => {
    const report = await deliverToDevices([{ id: 'a', platform: 'ios', token: '1' }], message, { apns: sender(async () => ({ status: 'dead', reason: '410 Unregistered' })) })
    expect(report).toMatchObject({ revoked: 1, revokedIds: ['a'] })
  })

  it('picks the text per device, so each gets its own language', async () => {
    const seen: string[] = []
    await deliverToDevices([
      { id: 'a', platform: 'android', token: '1', locale: 'da' },
      { id: 'b', platform: 'android', token: '2', locale: null },
    ], device => ({ title: device.locale === 'da' ? 'Hej' : 'Hello', body: '' }), {
      fcm: {
        send: async (sent) => {
          seen.push(sent.title)
          return { status: 'sent' }
        },
      },
    })
    expect(seen.sort()).toEqual(['Hej', 'Hello'])
  })
})

describe('chunk', () => {
  it('keeps every IN list under the 100 bound parameters of D1', () => {
    const ids = Array.from({ length: 250 }, (_, index) => index)
    const pieces = chunk(ids)
    expect(pieces.map(piece => piece.length)).toEqual([90, 90, 70])
    expect(pieces.flat()).toEqual(ids)
    expect(chunk([])).toEqual([])
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]])
  })
})

describe('requestTimeoutMs', () => {
  it('reads a number or an env string and falls back to 10 seconds', () => {
    expect([2500, '3000', '', 0, 'abc', undefined as unknown as number].map(timeoutMs => requestTimeoutMs({ timeoutMs }))).toEqual([2500, 3000, 10000, 10000, 10000, 10000])
  })
})
