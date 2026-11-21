import { describe, expect, it } from 'vitest'
import { deliverToDevices } from '../../src/runtime/providers/deliver'
import { chunk } from '../../src/runtime/providers/chunk'
import { apnsConfigOf, createPlatformSenders, hasApnsCredentials, hasFcmCredentials, isApnsSandbox, requestTimeoutMs, resolvePushDriver } from '../../src/runtime/providers/config'
import type { PushRuntimeConfig } from '../../src/types'
import type { DeviceSender } from '../../src/runtime/providers/types'

const config = (overrides: Partial<PushRuntimeConfig> = {}): PushRuntimeConfig => ({
  driver: '',
  timeoutMs: 10000,
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

  it('creates a sender per configured provider only', () => {
    expect(createPlatformSenders(config())).toEqual({ android: undefined, ios: undefined })
    const senders = createPlatformSenders(config({ apns: { keyId: 'k', teamId: 't', topic: 'a', privateKey: 'p', sandbox: false } }))
    expect(senders.ios).toBeDefined()
    expect(senders.android).toBeUndefined()
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
      android: sender(async token => token === 'dead' ? { status: 'dead', reason: '404' } : { status: 'sent' }),
      ios: sender(async (token) => {
        if (token === 'throws') throw new Error('boom')
        return { status: 'failed', reason: '500' }
      }),
    })
    expect(report).toMatchObject({ sent: 1, failed: 3, revoked: 1, revokedIds: ['b'] })
    expect([...report.problems].sort()).toEqual(['c: 500', 'd: boom', 'e: no web provider is configured'])
  })

  it('reports a platform without a provider as failed', async () => {
    const report = await deliverToDevices([{ id: 'a', platform: 'ios', token: 't' }], message, {})
    expect(report).toMatchObject({ sent: 0, failed: 1, revoked: 0 })
  })

  it('sends to many devices in batches', async () => {
    const devices = Array.from({ length: 25 }, (_, index) => ({ id: `d${index}`, platform: 'android', token: `t${index}` }))
    let concurrent = 0
    let peak = 0
    const report = await deliverToDevices(devices, message, {
      android: sender(async () => {
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
    ], message, { ios: bad, android: sender(async () => ({ status: 'sent' })) })
    expect(report).toMatchObject({ sent: 1, failed: 2, revoked: 0, revokedIds: [] })
    expect(report.problems[0]).toContain('push.apns.sandbox')
  })

  it('revokes a BadDeviceToken when other iOS devices of the call were fine', async () => {
    const report = await deliverToDevices([
      { id: 'a', platform: 'ios', token: 'bad' },
      { id: 'b', platform: 'ios', token: 'ok' },
    ], message, { ios: sender(async token => token === 'bad' ? { status: 'dead', reason: '400 BadDeviceToken', ambiguous: true } : { status: 'sent' }) })
    expect(report).toMatchObject({ sent: 1, failed: 0, revoked: 1, revokedIds: ['a'] })
  })

  it('still revokes an unambiguous dead token when every iOS device is dead', async () => {
    const report = await deliverToDevices([{ id: 'a', platform: 'ios', token: '1' }], message, { ios: sender(async () => ({ status: 'dead', reason: '410 Unregistered' })) })
    expect(report).toMatchObject({ revoked: 1, revokedIds: ['a'] })
  })

  it('picks the text per device, so each gets its own language', async () => {
    const seen: string[] = []
    await deliverToDevices([
      { id: 'a', platform: 'android', token: '1', locale: 'da' },
      { id: 'b', platform: 'android', token: '2', locale: null },
    ], device => ({ title: device.locale === 'da' ? 'Hej' : 'Hello', body: '' }), {
      android: {
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
