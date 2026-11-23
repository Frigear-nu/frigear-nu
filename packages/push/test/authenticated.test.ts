import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { pushApi } from '../src/runtime/utils/api'
import type { PushDeviceDto, SendPushResult } from '../src/types'
import { createToken, deviceRows, getHookCalls, getProviderCalls, registerUser } from './helpers'

let counter = 0
const unique = (prefix: string) => `${prefix}-u${++counter}`

const register = (cookie: string, token: string, platform: 'ios' | 'android' = 'android', extra: Record<string, unknown> = {}) =>
  apiClient({ cookie }).json<PushDeviceDto>('POST', pushApi.me.devices, { platform, token, ...extra })

// An installation secret, as the app generates it once per installation (at least 16 characters).
const secretOf = (name: string) => `installation-secret-${name}-0123456789`
const heal = (token: string, healed = true) => $fetch('/api/test/heal', { method: 'POST', body: { token, healed } })

const send = (body: Record<string, unknown>) => $fetch<SendPushResult>('/api/test/send', { method: 'POST', body })

let staffCookie: string | undefined
// The test role provider (server/roles/provider.ts) makes only staff@example.com staff; register it once.
const registerStaff = async () => (staffCookie ??= (await registerUser('Staff', 'staff@example.com')).cookie)

describe('push (authenticated, database-backed)', async () => {
  const rootDir = fileURLToPath(new URL('./fixtures/authenticated', import.meta.url))
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({ rootDir, dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000 })

  // Runs first on purpose: the senders cache the OAuth access token (FCM) and the provider JWT (APNs), so only the
  // first burst of the process shows them being requested and signed.
  describe('sendPush (FCM and APNs)', () => {
    it('sends to Android through FCM and to iOS through APNs with verified credentials, once per burst', async () => {
      const user = await registerUser('Sender', 'sender@example.com')
      await register(user.cookie, 'fcm-ok-1', 'android')
      await register(user.cookie, 'fcm-ok-2', 'android')
      await register(user.cookie, 'apns-ok-1', 'ios')
      await getProviderCalls(true)

      const result = await send({ userIds: [user.id], title: 'Shift tomorrow', body: 'You work 18:00', url: '/shifts/42', data: { shiftId: '42' } })
      expect(result).toEqual({ sent: 3, failed: 0, revoked: 0 })

      const calls = await getProviderCalls()
      // One OAuth token request, with an RS256 assertion for the service account that verified against its key.
      const oauth = calls.filter(call => call.provider === 'google-oauth')
      expect(oauth).toHaveLength(1)
      expect(oauth[0]).toMatchObject({
        verified: true,
        header: { alg: 'RS256' },
        claims: { iss: 'push@test-project.iam.gserviceaccount.com', aud: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/firebase.messaging' },
      })

      const fcm = calls.filter(call => call.provider === 'fcm')
      expect(fcm).toHaveLength(2)
      expect(fcm[0]!.url).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send')
      expect(fcm.every(call => call.verified && call.headers.authorization === 'Bearer ya29.fake-access-token')).toBe(true)
      expect(fcm.map(call => (call.body as { message: { token: string } }).message.token).sort()).toEqual(['fcm-ok-1', 'fcm-ok-2'])
      expect(fcm[0]!.body).toMatchObject({ message: { notification: { title: 'Shift tomorrow', body: 'You work 18:00' }, data: { shiftId: '42', url: '/shifts/42' } } })

      // APNs: an ES256 provider token with the key id and team id, the app's topic, production host.
      const apns = calls.filter(call => call.provider === 'apns')
      expect(apns).toHaveLength(1)
      expect(apns[0]).toMatchObject({
        verified: true,
        url: 'https://api.push.apple.com/3/device/apns-ok-1',
        header: { alg: 'ES256', kid: 'KEY1234567' },
        claims: { iss: 'TEAM123456' },
        headers: { 'apns-topic': 'com.example.test', 'apns-push-type': 'alert' },
        body: { shiftId: '42', url: '/shifts/42', aps: { alert: { title: 'Shift tomorrow', body: 'You work 18:00' } } },
      })

      // A second burst reuses both credentials.
      await getProviderCalls(true)
      await send({ userIds: [user.id], title: 'Again', body: 'Again' })
      const again = await getProviderCalls()
      expect(again.filter(call => call.provider === 'google-oauth')).toHaveLength(0)
      expect(again.filter(call => call.provider === 'fcm' || call.provider === 'apns').every(call => call.verified)).toBe(true)
    })

    it('revokes dead tokens, keeps tokens of a failing provider and never throws for one device', async () => {
      const user = await registerUser('Dead', 'dead@example.com')
      const deadAndroid = await register(user.cookie, 'fcm-dead-1', 'android')
      const deadIos = await register(user.cookie, 'apns-dead-1', 'ios')
      const brokenIos = await register(user.cookie, 'apns-broken-1', 'ios')
      const ok = await register(user.cookie, 'fcm-ok-3', 'android')

      expect(await send({ userIds: [user.id], title: 'Hi', body: 'There' })).toEqual({ sent: 1, failed: 1, revoked: 2 })

      const rows = new Map((await deviceRows()).map(row => [row.id, row]))
      expect(rows.get(deadAndroid.id)!.revokedAt).not.toBeNull()
      expect(rows.get(deadIos.id)!.revokedAt).not.toBeNull()
      expect(rows.get(brokenIos.id)!.revokedAt).toBeNull()
      expect(rows.get(ok.id)!.revokedAt).toBeNull()

      // Revoked devices are not sent to again, and drop out of the user's list.
      expect(await send({ userIds: [user.id], title: 'Hi', body: 'Again' })).toEqual({ sent: 1, failed: 1, revoked: 0 })
      const listed = await apiClient({ cookie: user.cookie }).json<PushDeviceDto[]>('GET', pushApi.me.devices)
      expect(listed.map(device => device.id).sort()).toEqual([brokenIos.id, ok.id].sort())

      // The same token registered again is active again (a reinstalled app gets a fresh token, an old one can return).
      const back = await register(user.cookie, 'fcm-dead-1', 'android')
      expect(back.id).toBe(deadAndroid.id)
      expect(back.revokedAt).toBeNull()
    })

    it('answers zeros for users without devices', async () => {
      const user = await registerUser('Nobody', 'nobody@example.com')
      expect(await send({ userIds: [user.id], title: 'Hi', body: 'There' })).toEqual({ sent: 0, failed: 0, revoked: 0 })
      expect(await send({ userIds: [], title: 'Hi', body: 'There' })).toEqual({ sent: 0, failed: 0, revoked: 0 })
    })

    it('is notify\'s push driver: dispatchPushNotification reaches the stored devices through the providers', async () => {
      const user = await registerUser('Dispatch', 'dispatch@example.com')
      await register(user.cookie, unique('fcm-ok'), 'android')
      await register(user.cookie, unique('apns-ok'), 'ios')
      await getProviderCalls(true)

      const result = await $fetch<SendPushResult | null>('/api/test/dispatch', {
        method: 'POST',
        body: { userIds: [user.id], title: 'Shift moved', body: 'Now 19:00', url: '/shifts/7', data: { shiftId: '7' } },
      })
      expect(result).toEqual({ sent: 2, failed: 0, revoked: 0 })

      const calls = await getProviderCalls()
      const fcm = calls.filter(call => call.provider === 'fcm')
      const apns = calls.filter(call => call.provider === 'apns')
      expect(fcm).toHaveLength(1)
      expect(fcm[0]!.body).toMatchObject({ message: { notification: { title: 'Shift moved', body: 'Now 19:00' }, data: { shiftId: '7', url: '/shifts/7' } } })
      expect(apns).toHaveLength(1)
      expect(apns[0]!.body).toMatchObject({ shiftId: '7', url: '/shifts/7', aps: { alert: { title: 'Shift moved', body: 'Now 19:00' } } })
    })

    it('reaches users among hundreds of ids (queries are chunked for D1\'s bound-parameter limit)', async () => {
      const user = await registerUser('Crowd', 'crowd@example.com')
      await register(user.cookie, unique('fcm-ok'))
      const others = Array.from({ length: 300 }, (_, index) => 900_000 + index)
      expect(await send({ userIds: [...others.slice(0, 150), user.id, ...others.slice(150)], title: 'Hi', body: 'There' })).toEqual({ sent: 1, failed: 0, revoked: 0 })
    })

    it('does not revoke iOS devices when every one of them gets BadDeviceToken (a sandbox or production mix-up)', async () => {
      const user = await registerUser('Sandbox', 'sandbox@example.com')
      const first = await register(user.cookie, unique('apns-baddevice'), 'ios')
      const second = await register(user.cookie, unique('apns-baddevice'), 'ios')
      expect(await send({ userIds: [user.id], title: 'Hi', body: 'There' })).toEqual({ sent: 0, failed: 2, revoked: 0 })
      const rows = new Map((await deviceRows()).map(row => [row.id, row]))
      expect(rows.get(first.id)!.revokedAt).toBeNull()
      expect(rows.get(second.id)!.revokedAt).toBeNull()

      // With one good iOS device in the call the bad token is a dead one.
      await register(user.cookie, unique('apns-ok'), 'ios')
      expect(await send({ userIds: [user.id], title: 'Hi', body: 'There' })).toEqual({ sent: 1, failed: 0, revoked: 2 })
    })

    it('revokes a device after 3 refused pushes in a row; a delivered push or registering again starts over', async () => {
      const user = await registerUser('Refused', 'refused@example.com')
      const token = unique('fcm-rejected')
      const device = await register(user.cookie, token, 'android', { secret: secretOf('refused') })
      const failures = async () => (await deviceRows()).find(row => row.id === device.id)!

      // Two refusals, then a delivered push: the count starts over.
      expect(await send({ userIds: [user.id], title: 'Hi', body: '1' })).toEqual({ sent: 0, failed: 1, revoked: 0 })
      expect(await send({ userIds: [user.id], title: 'Hi', body: '2' })).toEqual({ sent: 0, failed: 1, revoked: 0 })
      expect((await failures()).failures).toBe(2)
      await heal(token)
      expect(await send({ userIds: [user.id], title: 'Hi', body: '3' })).toEqual({ sent: 1, failed: 0, revoked: 0 })
      expect((await failures()).failures).toBe(0)
      await heal(token, false)

      // Two refusals, then registering again starts over too.
      await send({ userIds: [user.id], title: 'Hi', body: '4' })
      await send({ userIds: [user.id], title: 'Hi', body: '5' })
      await register(user.cookie, token, 'android', { secret: secretOf('refused') })
      expect((await failures()).failures).toBe(0)

      // Three in a row revoke it.
      expect(await send({ userIds: [user.id], title: 'Hi', body: '6' })).toEqual({ sent: 0, failed: 1, revoked: 0 })
      expect(await send({ userIds: [user.id], title: 'Hi', body: '7' })).toEqual({ sent: 0, failed: 1, revoked: 0 })
      expect(await send({ userIds: [user.id], title: 'Hi', body: '8' })).toEqual({ sent: 0, failed: 0, revoked: 1 })
      expect((await failures()).revokedAt).not.toBeNull()
      expect(await send({ userIds: [user.id], title: 'Hi', body: '9' })).toEqual({ sent: 0, failed: 0, revoked: 0 })
    })

    it('revokes the only iOS device of a user after 3 BadDeviceToken answers, and not for an outage', async () => {
      const user = await registerUser('Lone iOS', 'lone-ios@example.com')
      const bad = await register(user.cookie, unique('apns-baddevice'), 'ios')
      const other = await registerUser('Outage', 'outage@example.com')
      const broken = await register(other.cookie, unique('fcm-broken'), 'android')
      for (let index = 0; index < 2; index++) {
        expect(await send({ userIds: [user.id], title: 'Hi', body: 'There' })).toEqual({ sent: 0, failed: 1, revoked: 0 })
      }
      expect(await send({ userIds: [user.id], title: 'Hi', body: 'There' })).toEqual({ sent: 0, failed: 0, revoked: 1 })
      expect((await deviceRows()).find(row => row.id === bad.id)!.revokedAt).not.toBeNull()

      // A provider outage (500) says nothing about the device: never counted.
      for (let index = 0; index < 4; index++) await send({ userIds: [other.id], title: 'Hi', body: 'There' })
      const row = (await deviceRows()).find(item => item.id === broken.id)!
      expect(row.failures).toBe(0)
      expect(row.revokedAt).toBeNull()
    })

    it('picks the text of each device\'s locale', async () => {
      const user = await registerUser('Locale', 'locale@example.com')
      await register(user.cookie, unique('fcm-ok'), 'android', { locale: 'da-DK' })
      await register(user.cookie, unique('fcm-ok'), 'android', { locale: 'en' })
      await register(user.cookie, unique('fcm-ok'), 'android')
      await getProviderCalls(true)
      await send({ userIds: [user.id], title: { da: 'Vagt i morgen', en: 'Shift tomorrow' }, body: { da: 'Du har vagt', en: 'You work' } })
      const titles = (await getProviderCalls()).filter(call => call.provider === 'fcm').map(call => (call.body as { message: { notification: { title: string } } }).message.notification.title)
      expect(titles.sort()).toEqual(['Shift tomorrow', 'Shift tomorrow', 'Vagt i morgen'])
    })

    // Cloudflare Workers have no HTTP/2 client for APNs: an iOS app that registers its FCM token is sent to through FCM.
    it('sends an iOS device registered with its FCM token through FCM, and one without a provider through APNs', async () => {
      const user = await registerUser('Fcm iOS', 'fcm-ios@example.com')
      const viaFcm = await register(user.cookie, unique('fcm-ok-ios'), 'ios', { provider: 'fcm' })
      const viaApns = await register(user.cookie, unique('apns-ok'), 'ios')
      expect(viaFcm.provider).toBe('fcm')
      expect(viaApns.provider).toBe('apns')
      const rows = new Map((await deviceRows()).map(row => [row.id, row]))
      expect(rows.get(viaFcm.id)!.provider).toBe('fcm')
      expect(rows.get(viaApns.id)!.provider).toBe('apns')

      await getProviderCalls(true)
      expect(await send({ userIds: [user.id], title: 'Hi', body: 'There', url: '/shifts/42' })).toEqual({ sent: 2, failed: 0, revoked: 0 })
      const calls = await getProviderCalls()
      const fcm = calls.filter(call => call.provider === 'fcm')
      expect(fcm).toHaveLength(1)
      expect(fcm[0]!.body).toMatchObject({
        message: {
          token: expect.stringMatching(/^fcm-ok-ios/),
          notification: { title: 'Hi', body: 'There' },
          data: { url: '/shifts/42' },
          apns: { payload: { aps: { sound: 'default' } } },
        },
      })
      expect(calls.filter(call => call.provider === 'apns').map(call => call.url)).toEqual([expect.stringMatching(/\/3\/device\/apns-ok/)])
    })

    it('revokes an iOS FCM token that FCM reports dead, without asking APNs', async () => {
      const user = await registerUser('Fcm iOS dead', 'fcm-ios-dead@example.com')
      const dead = await register(user.cookie, unique('fcm-dead-ios'), 'ios', { provider: 'fcm' })
      await getProviderCalls(true)
      expect(await send({ userIds: [user.id], title: 'Hi', body: 'There' })).toEqual({ sent: 0, failed: 0, revoked: 1 })
      expect((await getProviderCalls()).filter(call => call.provider === 'apns')).toEqual([])
      expect((await deviceRows()).find(row => row.id === dead.id)!.revokedAt).not.toBeNull()
    })

    it('moves a token to FCM when the device registers it again with that provider', async () => {
      const user = await registerUser('Fcm move', 'fcm-move@example.com')
      const token = unique('fcm-ok-moved')
      const before = await register(user.cookie, token, 'ios')
      expect(before.provider).toBe('apns')
      const after = await register(user.cookie, token, 'ios', { provider: 'fcm' })
      expect(after).toMatchObject({ id: before.id, provider: 'fcm' })
    })
  })

  describe('devices', () => {
    it('removes the APNs device of an installation that registers its FCM token, so it is not notified twice', async () => {
      const user = await registerUser('Switch', 'switch@example.com')
      const other = await registerUser('Bystander', 'bystander@example.com')
      const api = apiClient({ cookie: user.cookie })
      const apnsToken = unique('apns-ok')
      const otherToken = unique('apns-ok')
      const secret = secretOf('switch')
      const apns = await register(user.cookie, apnsToken, 'ios', { provider: 'apns', secret })
      await register(other.cookie, otherToken, 'ios', { secret: secretOf('bystander') })

      // `replaces` needs the installation secret.
      await expectApiError(apiClient({ cookie: user.cookie }).json('POST', pushApi.me.devices, { platform: 'ios', provider: 'fcm', token: unique('fcm-ok'), replaces: apnsToken }), 400)
      // Another installation (another secret) of the same user does not remove it either.
      await register(user.cookie, unique('fcm-ok'), 'ios', { provider: 'fcm', replaces: apnsToken, secret: secretOf('another-phone') })
      expect((await deviceRows()).some(row => row.token === apnsToken)).toBe(true)
      for (const device of await api.json<PushDeviceDto[]>('GET', pushApi.me.devices)) {
        if (device.id !== apns.id) await api.json('DELETE', pushApi.me.device(device.id))
      }

      const fcm = await register(user.cookie, unique('fcm-ok'), 'ios', { provider: 'fcm', replaces: apnsToken, secret })
      expect(fcm.id).not.toBe(apns.id)
      expect(await api.json<PushDeviceDto[]>('GET', pushApi.me.devices)).toEqual([expect.objectContaining({ id: fcm.id, provider: 'fcm' })])
      expect((await deviceRows()).some(row => row.token === apnsToken)).toBe(false)

      // Another user's token is never removed this way.
      await register(user.cookie, unique('fcm-ok'), 'ios', { provider: 'fcm', replaces: otherToken, secret })
      expect(await apiClient({ cookie: other.cookie }).json<PushDeviceDto[]>('GET', pushApi.me.devices)).toHaveLength(1)
    })

    it('registers, lists and removes the caller\'s devices, and fires push:device:registered', async () => {
      const user = await registerUser('Ada', 'ada@example.com')
      const api = apiClient({ cookie: user.cookie })
      await getHookCalls(true)

      const token = unique('fcm-ok')
      const device = await register(user.cookie, token, 'android', { appId: 'com.example.app', locale: 'da' })
      expect(device).toMatchObject({ id: expect.stringMatching(/^psd_/), userId: user.id, platform: 'android', provider: 'fcm', appId: 'com.example.app', locale: 'da', revokedAt: null })
      expect(device).not.toHaveProperty('token')
      expect(await getHookCalls()).toEqual([{ hook: 'push:device:registered', deviceId: device.id, userId: user.id, platform: 'android' }])

      // Registering the same token again is idempotent: same device, one row.
      const again = await register(user.cookie, token, 'android', { appId: 'com.example.app', locale: 'en' })
      expect(again).toMatchObject({ id: device.id, locale: 'en' })
      expect(await api.json<PushDeviceDto[]>('GET', pushApi.me.devices)).toHaveLength(1)

      expect(await api.json('DELETE', pushApi.me.device(device.id))).toBeNull()
      expect(await api.json<PushDeviceDto[]>('GET', pushApi.me.devices)).toEqual([])
      await expectApiError(api.json('DELETE', pushApi.me.device(device.id)), 404)
    })

    it('never removes another user\'s device by id', async () => {
      const owner = await registerUser('Owner', 'owner@example.com')
      const stranger = await registerUser('Stranger', 'stranger@example.com')
      const device = await register(owner.cookie, unique('fcm-ok'))

      // A device of someone else answers like an unknown id, and stays registered.
      await expectApiError(apiClient({ cookie: stranger.cookie }).json('DELETE', pushApi.me.device(device.id)), 404)
      await expectApiError(apiClient().json('DELETE', pushApi.me.device(device.id)), 401)
      expect(await apiClient({ cookie: owner.cookie }).json<PushDeviceDto[]>('GET', pushApi.me.devices)).toEqual([expect.objectContaining({ id: device.id })])
    })

    it('serves the account devices page with the caller\'s devices', async () => {
      const user = await registerUser('Page', 'page@example.com')
      await register(user.cookie, unique('apns-ok'), 'ios')
      const response = await apiClient({ cookie: user.cookie }).fetch('GET', '/account/devices')
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain('Your devices')
      expect(html).toContain('APNs')
    })

    it('validates the body and needs a signed-in user', async () => {
      const user = await registerUser('Bob', 'bob@example.com')
      const api = apiClient({ cookie: user.cookie })
      await expectApiError(api.json('POST', pushApi.me.devices, { platform: 'windows', token: 'x' }), 400)
      // Web push is not part of v1.
      await expectApiError(api.json('POST', pushApi.me.devices, { platform: 'web', token: 'x' }), 400)
      await expectApiError(api.json('POST', pushApi.me.devices, { platform: 'ios', token: '   ' }), 400)
      await expectApiError(api.json('POST', pushApi.me.devices, { platform: 'ios' }), 400)
      // An Android token is always an FCM token, and only the two providers exist.
      await expectApiError(api.json('POST', pushApi.me.devices, { platform: 'android', token: 'x', provider: 'apns' }), 400)
      await expectApiError(api.json('POST', pushApi.me.devices, { platform: 'ios', token: 'x', provider: 'sns' }), 400)
      await expectApiError(apiClient().json('GET', pushApi.me.devices), 401)
      await expectApiError(apiClient().json('POST', pushApi.me.devices, { platform: 'ios', token: 'x' }), 401)
      await expectApiError(apiClient().json('POST', pushApi.me.unregister, { token: 'x', secret: secretOf('x') }), 401)
      // A secret too short to be one.
      await expectApiError(api.json('POST', pushApi.me.devices, { platform: 'ios', token: 'x', secret: 'short' }), 400)
    })

    it('moves a token to another user only with the installation secret, else 409 device_owned', async () => {
      const first = await registerUser('First', 'first@example.com')
      const second = await registerUser('Second', 'second@example.com')
      const token = unique('apns-ok')
      const secret = secretOf('shared-phone')

      const firstDevice = await register(first.cookie, token, 'ios', { secret })
      // The same user again, with or without the secret: the same row.
      expect(await register(first.cookie, token, 'ios')).toMatchObject({ id: firstDevice.id, userId: first.id })
      expect(await register(first.cookie, token, 'ios', { secret })).toMatchObject({ id: firstDevice.id, userId: first.id })

      // Someone who only knows the token cannot take it over (nor through a wrong secret), and nothing changes.
      const takeover = (extra: Record<string, unknown>) => apiClient({ cookie: second.cookie }).json('POST', pushApi.me.devices, { platform: 'ios', token, ...extra })
      await expectApiError(takeover({}), 409, 'device_owned')
      await expectApiError(takeover({ secret: secretOf('attacker') }), 409, 'device_owned')
      expect(await apiClient({ cookie: first.cookie }).json<PushDeviceDto[]>('GET', pushApi.me.devices)).toEqual([expect.objectContaining({ id: firstDevice.id })])
      expect(await apiClient({ cookie: second.cookie }).json('GET', pushApi.me.devices)).toEqual([])
      // Nor remove it: unregistering or replacing it as someone else leaves it alone.
      expect(await apiClient({ cookie: second.cookie }).json('POST', pushApi.me.unregister, { token, secret: secretOf('attacker') })).toBeNull()
      await register(second.cookie, unique('fcm-ok'), 'ios', { provider: 'fcm', replaces: token, secret: secretOf('attacker') })
      expect((await deviceRows()).find(row => row.id === firstDevice.id)).toMatchObject({ userId: first.id })

      // The phone changes hands: the next user signs in on the same installation, which sends its secret.
      const moved = await register(second.cookie, token, 'ios', { secret })
      expect(moved).toMatchObject({ id: firstDevice.id, userId: second.id })
      expect(await apiClient({ cookie: first.cookie }).json('GET', pushApi.me.devices)).toEqual([])
      // Only the hash of the secret is stored.
      const stored = (await deviceRows()).find(row => row.id === firstDevice.id)!
      expect(stored.secretHash).toMatch(/^[0-9a-f]{64}$/)
      expect(JSON.stringify(stored)).not.toContain(secret)

      // The previous owner can no longer remove it, and learns nothing about it.
      await expectApiError(apiClient({ cookie: first.cookie }).json('DELETE', pushApi.me.device(moved.id)), 404)
      expect(await apiClient({ cookie: second.cookie }).json<PushDeviceDto[]>('GET', pushApi.me.devices)).toContainEqual(expect.objectContaining({ id: moved.id, userId: second.id }))
    })

    it('refuses to move a token registered without a secret to another user', async () => {
      const first = await registerUser('Nosecret', 'nosecret@example.com')
      const second = await registerUser('Nosecret two', 'nosecret2@example.com')
      const token = unique('fcm-ok')
      const device = await register(first.cookie, token)
      await expectApiError(apiClient({ cookie: second.cookie }).json('POST', pushApi.me.devices, { platform: 'android', token, secret: secretOf('guess') }), 409, 'device_owned')
      expect((await deviceRows()).find(row => row.id === device.id)).toMatchObject({ userId: first.id, secretHash: null })
    })

    it('unregisters by token, idempotently, and never touches another user\'s token', async () => {
      const mine = await registerUser('Mine', 'mine@example.com')
      const other = await registerUser('Other', 'other@example.com')
      const myToken = unique('fcm-ok')
      const otherToken = unique('fcm-ok')
      const secret = secretOf('mine')
      await register(mine.cookie, myToken, 'android', { secret })
      await register(other.cookie, otherToken, 'android', { secret: secretOf('other') })
      const api = apiClient({ cookie: mine.cookie })

      // The secret is required, and a wrong one leaves the device alone.
      await expectApiError(api.json('POST', pushApi.me.unregister, { token: myToken }), 400)
      expect(await api.json('POST', pushApi.me.unregister, { token: myToken, secret: secretOf('wrong') })).toBeNull()
      expect(await api.json<PushDeviceDto[]>('GET', pushApi.me.devices)).toHaveLength(1)

      expect(await api.json('POST', pushApi.me.unregister, { token: myToken, secret })).toBeNull()
      expect(await api.json('GET', pushApi.me.devices)).toEqual([])
      expect(await api.json('POST', pushApi.me.unregister, { token: myToken, secret })).toBeNull()
      expect(await api.json('POST', pushApi.me.unregister, { token: unique('unknown'), secret })).toBeNull()

      expect(await api.json('POST', pushApi.me.unregister, { token: otherToken, secret: secretOf('other') })).toBeNull()
      expect(await apiClient({ cookie: other.cookie }).json<PushDeviceDto[]>('GET', pushApi.me.devices)).toHaveLength(1)
      await expectApiError(api.json('POST', pushApi.me.unregister, {}), 400)
    })
  })

  describe('API tokens', () => {
    it('lets a token with the push scope manage devices, and refuses one without', async () => {
      const user = await registerUser('Token', 'token@example.com')
      for (const scopes of [['push:devices'], ['push']]) {
        const api = apiClient({ bearer: await createToken(user.cookie, scopes) })
        const device = await api.json<PushDeviceDto>('POST', pushApi.me.devices, { platform: 'ios', token: unique('apns-ok') })
        expect(await api.json<PushDeviceDto[]>('GET', pushApi.me.devices)).toContainEqual(device)
        expect(await api.json('DELETE', pushApi.me.device(device.id))).toBeNull()
      }

      const without = apiClient({ bearer: await createToken(user.cookie, ['profile:read']) })
      await expectApiError(without.json('GET', pushApi.me.devices), 403, 'insufficient_scope')
      await expectApiError(without.json('POST', pushApi.me.devices, { platform: 'ios', token: 'x' }), 403, 'insufficient_scope')
      await expectApiError(apiClient({ bearer: 'fnu_invalid' }).json('GET', pushApi.me.devices), 401)
    })
  })

  describe('admin: a user\'s devices and test pushes', () => {
    it('is closed to guests and to users without push:manage, and 404s unknown users', async () => {
      const staff = await registerStaff()
      const member = await registerUser('Member', 'member@example.com')
      const reader = await registerUser('Reader', 'reader@example.com')

      await expectApiError(apiClient().json('GET', pushApi.admin.userDevices(member.id)), 401)
      await expectApiError(apiClient({ cookie: member.cookie }).json('GET', pushApi.admin.userDevices(member.id)), 403)
      // Seeing users is not enough to see their devices.
      await expectApiError(apiClient({ cookie: reader.cookie }).json('GET', pushApi.admin.userDevices(member.id)), 403)
      await expectApiError(apiClient({ cookie: staff }).json('GET', pushApi.admin.userDevices('nope')), 400)
      await expectApiError(apiClient({ cookie: staff }).json('GET', pushApi.admin.userDevices(99999)), 404)
    })

    it('lists every device of a user for staff, revoked ones too', async () => {
      const staff = apiClient({ cookie: await registerStaff() })
      const user = await registerUser('Kim', 'kim@example.com')
      const live = await register(user.cookie, unique('fcm-ok'), 'android', { appId: 'com.example.app' })
      const dead = await register(user.cookie, unique('fcm-dead'), 'android')
      await send({ userIds: [user.id], title: 'Hi', body: 'There' })

      const devices = await staff.json<PushDeviceDto[]>('GET', pushApi.admin.userDevices(user.id))
      expect(devices.map(device => [device.id, device.revokedAt === null])).toEqual(expect.arrayContaining([[live.id, true], [dead.id, false]]))
      expect(devices).toHaveLength(2)
      expect(devices.every(device => !('token' in device))).toBe(true)
      // The tab shows where each device's pushes go.
      expect(devices.map(device => device.provider)).toEqual(['fcm', 'fcm'])
    })

    it('lets a token read devices only with push:manage, and refuses to mint it for a user without the permission', async () => {
      const staffCookie = await registerStaff()
      const user = await registerUser('Lea', 'lea@example.com')
      const staffToken = await createToken(staffCookie, ['push:manage', 'users:read'])
      expect((await apiClient({ bearer: staffToken }).json<PushDeviceDto[]>('GET', pushApi.admin.userDevices(user.id)))).toEqual([])
      await expectApiError(apiClient({ bearer: await createToken(staffCookie, ['push:devices']) }).json('GET', pushApi.admin.userDevices(user.id)), 403, 'insufficient_scope')

      const response = await apiClient({ cookie: user.cookie }).fetch('POST', '/api/auth/me/tokens', { name: 'probe', scopes: ['push:manage'] })
      expect(response.status).toBe(403)
    })

    it('sends a test push to a user\'s devices for staff with push:send', async () => {
      const staff = apiClient({ cookie: await registerStaff() })
      const user = await registerUser('Max', 'max@example.com')
      await register(user.cookie, unique('fcm-ok'))
      await register(user.cookie, unique('fcm-ok'), 'android', { locale: 'da' })
      await getProviderCalls(true)

      expect(await staff.json<SendPushResult>('POST', pushApi.admin.test, { userId: user.id })).toEqual({ sent: 2, failed: 0, revoked: 0 })
      // The text follows each device's locale: English without one, Danish for `da`.
      const titles = (await getProviderCalls()).filter(call => call.provider === 'fcm').map(call => (call.body as { message: { notification: { title: string } } }).message.notification.title)
      expect(titles.sort()).toEqual(['Test notification', 'Testnotifikation'])

      // A user without devices: reached nobody.
      const lonely = await registerUser('Lonely', 'lonely@example.com')
      expect(await staff.json<SendPushResult>('POST', pushApi.admin.test, { userId: lonely.id })).toEqual({ sent: 0, failed: 0, revoked: 0 })
    })

    it('refuses test pushes to guests and users without push:send, unknown users and bad bodies', async () => {
      const staff = apiClient({ cookie: await registerStaff() })
      const member = await registerUser('Nina', 'nina@example.com')

      await expectApiError(apiClient().json('POST', pushApi.admin.test, { userId: member.id }), 401)
      await expectApiError(apiClient({ cookie: member.cookie }).json('POST', pushApi.admin.test, { userId: member.id }), 403)
      await expectApiError(staff.json('POST', pushApi.admin.test, { userId: 99999 }), 404)
      await expectApiError(staff.json('POST', pushApi.admin.test, { userId: 'one' }), 400)
      await expectApiError(staff.json('POST', pushApi.admin.test, {}), 400)
    })
  })
})
