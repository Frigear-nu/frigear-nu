import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { pushApi } from '../src/runtime/utils/api'
import type { ChannelMatrixDto, NotifyUserResult, PushDeviceDto, SendPushResult } from '../src/types'
import { createToken, deviceRows, getHookCalls, getMails, getProviderCalls, getTexts, registerUser, setPhone } from './helpers'

let counter = 0
const unique = (prefix: string) => `${prefix}-${++counter}`

const register = (cookie: string, token: string, platform: 'ios' | 'android' = 'android', extra: Record<string, unknown> = {}) =>
  apiClient({ cookie }).json<PushDeviceDto>('POST', pushApi.me.devices, { platform, token, ...extra })

const notify = (body: Record<string, unknown>) => $fetch<NotifyUserResult>('/api/test/notify', { method: 'POST', body })
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
      await expectApiError(apiClient().json('POST', pushApi.me.unregister, { token: 'x' }), 401)
      await expectApiError(apiClient().json('GET', pushApi.me.channels), 401)
    })

    it('moves a token to the user who registers it last, and keeps other users\' devices out of reach', async () => {
      const first = await registerUser('First', 'first@example.com')
      const second = await registerUser('Second', 'second@example.com')
      const token = unique('apns-ok')

      const firstDevice = await register(first.cookie, token, 'ios')
      const moved = await register(second.cookie, token, 'ios')
      expect(moved).toMatchObject({ id: firstDevice.id, userId: second.id })
      expect(await apiClient({ cookie: first.cookie }).json('GET', pushApi.me.devices)).toEqual([])
      expect(await apiClient({ cookie: second.cookie }).json<PushDeviceDto[]>('GET', pushApi.me.devices)).toHaveLength(1)

      // The previous owner can no longer remove it, and learns nothing about it.
      await expectApiError(apiClient({ cookie: first.cookie }).json('DELETE', pushApi.me.device(moved.id)), 404)
      expect(await apiClient({ cookie: second.cookie }).json<PushDeviceDto[]>('GET', pushApi.me.devices)).toHaveLength(1)
    })

    it('unregisters by token, idempotently, and never touches another user\'s token', async () => {
      const mine = await registerUser('Mine', 'mine@example.com')
      const other = await registerUser('Other', 'other@example.com')
      const myToken = unique('fcm-ok')
      const otherToken = unique('fcm-ok')
      await register(mine.cookie, myToken)
      await register(other.cookie, otherToken)
      const api = apiClient({ cookie: mine.cookie })

      expect(await api.json('POST', pushApi.me.unregister, { token: myToken })).toBeNull()
      expect(await api.json('GET', pushApi.me.devices)).toEqual([])
      expect(await api.json('POST', pushApi.me.unregister, { token: myToken })).toBeNull()
      expect(await api.json('POST', pushApi.me.unregister, { token: unique('unknown') })).toBeNull()

      expect(await api.json('POST', pushApi.me.unregister, { token: otherToken })).toBeNull()
      expect(await apiClient({ cookie: other.cookie }).json<PushDeviceDto[]>('GET', pushApi.me.devices)).toHaveLength(1)
      await expectApiError(api.json('POST', pushApi.me.unregister, {}), 400)
    })
  })

  describe('API tokens', () => {
    it('lets a token with the push scope manage devices and channels, and refuses one without', async () => {
      const user = await registerUser('Token', 'token@example.com')
      for (const scopes of [['push:devices'], ['push']]) {
        const api = apiClient({ bearer: await createToken(user.cookie, scopes) })
        const device = await api.json<PushDeviceDto>('POST', pushApi.me.devices, { platform: 'ios', token: unique('apns-ok') })
        expect(await api.json<PushDeviceDto[]>('GET', pushApi.me.devices)).toContainEqual(device)
        expect((await api.json<ChannelMatrixDto>('GET', pushApi.me.channels)).topics).toHaveLength(2)
        expect(await api.json('DELETE', pushApi.me.device(device.id))).toBeNull()
      }

      const without = apiClient({ bearer: await createToken(user.cookie, ['profile:read']) })
      await expectApiError(without.json('GET', pushApi.me.devices), 403, 'insufficient_scope')
      await expectApiError(without.json('POST', pushApi.me.devices, { platform: 'ios', token: 'x' }), 403, 'insufficient_scope')
      await expectApiError(without.json('GET', pushApi.me.channels), 403, 'insufficient_scope')
      await expectApiError(apiClient({ bearer: 'fnu_invalid' }).json('GET', pushApi.me.devices), 401)
    })
  })

  describe('channel preferences', () => {
    it('lists every registered topic with its defaults and what is possible', async () => {
      const user = await registerUser('Cleo', 'cleo@example.com')
      const matrix = await apiClient({ cookie: user.cookie }).json<ChannelMatrixDto>('GET', pushApi.me.channels)
      expect(matrix).toMatchObject({ hasPhone: false, hasDevice: false })
      expect(matrix.topics).toEqual([
        { id: 'shifts.reminder', label: { da: 'Vagtpåmindelser', en: 'Shift reminders' }, channels: ['email', 'sms', 'push'], settings: { email: true, sms: false, push: true }, custom: false },
        { id: 'broadcast', label: 'Broadcasts', channels: ['email', 'push'], settings: { email: true, sms: false, push: false }, custom: false },
      ])

      await register(user.cookie, unique('fcm-ok'))
      await setPhone('cleo@example.com', '+15550100101')
      expect(await apiClient({ cookie: user.cookie }).json('GET', pushApi.me.channels)).toMatchObject({ hasPhone: true, hasDevice: true })
    })

    it('stores changes per topic and channel, keeps the rest, and answers the matrix', async () => {
      const user = await registerUser('Dan', 'dan@example.com')
      const other = await registerUser('Eve', 'eve@example.com')
      const api = apiClient({ cookie: user.cookie })

      const changed = await api.json<ChannelMatrixDto>('PATCH', pushApi.me.channels, { topics: { 'shifts.reminder': { push: false, sms: true } } })
      expect(changed.topics.find(topic => topic.id === 'shifts.reminder')).toMatchObject({ settings: { email: true, sms: true, push: false }, custom: true })
      expect(changed.topics.find(topic => topic.id === 'broadcast')).toMatchObject({ settings: { email: true, sms: false, push: false }, custom: false })

      // A later change keeps what was chosen before.
      await api.json('PATCH', pushApi.me.channels, { topics: { 'shifts.reminder': { email: false } } })
      const matrix = await api.json<ChannelMatrixDto>('GET', pushApi.me.channels)
      expect(matrix.topics.find(topic => topic.id === 'shifts.reminder')!.settings).toEqual({ email: false, sms: true, push: false })

      // Nobody else is affected.
      const untouched = await apiClient({ cookie: other.cookie }).json<ChannelMatrixDto>('GET', pushApi.me.channels)
      expect(untouched.topics.every(topic => !topic.custom)).toBe(true)
    })

    it('ignores a channel the topic does not offer and refuses unknown topics and malformed bodies', async () => {
      const user = await registerUser('Fay', 'fay@example.com')
      const api = apiClient({ cookie: user.cookie })

      const matrix = await api.json<ChannelMatrixDto>('PATCH', pushApi.me.channels, { topics: { broadcast: { sms: true, push: true } } })
      expect(matrix.topics.find(topic => topic.id === 'broadcast')!.settings).toEqual({ email: true, sms: false, push: true })

      const error = await expectApiError(api.json('PATCH', pushApi.me.channels, { topics: { 'nope.topic': { push: true }, 'shifts.reminder': { push: false } } }), 400, 'validation_failed')
      expect(JSON.stringify(error.data)).toContain('nope.topic')
      // Nothing of the refused request was stored.
      expect((await api.json<ChannelMatrixDto>('GET', pushApi.me.channels)).topics.find(topic => topic.id === 'shifts.reminder')!.custom).toBe(false)

      await expectApiError(api.json('PATCH', pushApi.me.channels, { topics: { broadcast: { fax: true } } }), 400)
      await expectApiError(api.json('PATCH', pushApi.me.channels, { topics: { broadcast: { push: 'yes' } } }), 400)
      await expectApiError(api.json('PATCH', pushApi.me.channels, {}), 400)
    })
  })

  describe('notifyUser', () => {
    it('sends on the channels the defaults allow and skips the ones that are off', async () => {
      const user = await registerUser('Gus', 'gus@example.com')
      await register(user.cookie, unique('fcm-ok'))
      await getMails(true)
      await getTexts(true)
      await getProviderCalls(true)

      const result = await notify({
        userId: user.id,
        topic: 'shifts.reminder',
        email: { subject: 'Shift tomorrow', body: '<p>You work 18:00</p>', text: 'You work 18:00' },
        sms: { body: 'You work 18:00' },
        push: { title: 'Shift tomorrow', body: 'You work 18:00', url: '/shifts/1' },
      })
      expect(result).toEqual({ channels: ['email', 'push'], skipped: { sms: 'disabled' } })
      expect(await getMails()).toEqual([expect.objectContaining({ to: 'gus@example.com', subject: 'Shift tomorrow', text: 'You work 18:00' })])
      expect(await getTexts()).toEqual([])
      expect((await getProviderCalls()).filter(call => call.provider === 'fcm')).toHaveLength(1)
    })

    it('hands the email\'s template and meta to the email driver, and only what was given', async () => {
      const user = await registerUser('Ida', 'ida@example.com')
      await getMails(true)
      const template = { name: 'shifts-reminder', props: { team: 'Bar' }, locale: 'da' }
      await notify({
        userId: user.id,
        topic: 'shifts.reminder',
        email: { subject: 'Shift', body: '<p>B</p>', replyTo: 'lead@example.com', template, meta: { shifts: { assignmentId: 'sha_1' } } },
      })
      expect(await getMails()).toEqual([{ to: 'ida@example.com', subject: 'Shift', body: '<p>B</p>', replyTo: 'lead@example.com', template, meta: { shifts: { assignmentId: 'sha_1' } } }])

      // Without them the email is what it was before: no `template`, no `meta`, not even as `undefined`.
      await getMails(true)
      await notify({ userId: user.id, topic: 'shifts.reminder', email: { subject: 'Plain', body: 'B' } })
      const [plain] = await getMails()
      expect(Object.keys(plain!).sort()).toEqual(['body', 'subject', 'to'])
    })

    it('honours the user\'s choices per channel', async () => {
      const user = await registerUser('Hal', 'hal@example.com')
      await register(user.cookie, unique('fcm-ok'))
      const api = apiClient({ cookie: user.cookie })
      const content = { userId: user.id, topic: 'shifts.reminder', email: { subject: 'S', body: 'B' }, push: { title: 'T', body: 'B' } }

      await api.json('PATCH', pushApi.me.channels, { topics: { 'shifts.reminder': { email: false, push: true } } })
      await getMails(true)
      await getProviderCalls(true)
      expect(await notify(content)).toEqual({ channels: ['push'], skipped: { email: 'disabled', sms: 'disabled' } })
      expect(await getMails()).toEqual([])

      await api.json('PATCH', pushApi.me.channels, { topics: { 'shifts.reminder': { email: true, push: false } } })
      await getProviderCalls(true)
      expect(await notify(content)).toEqual({ channels: ['email'], skipped: { push: 'disabled', sms: 'disabled' } })
      expect((await getProviderCalls()).filter(call => call.provider === 'fcm')).toEqual([])
      expect(await getMails()).toHaveLength(1)

      await api.json('PATCH', pushApi.me.channels, { topics: { 'shifts.reminder': { email: false, push: false } } })
      expect(await notify(content)).toEqual({ channels: [], skipped: { email: 'disabled', sms: 'disabled', push: 'disabled' } })
    })

    it('sends SMS through notify\'s driver only with a phone number, and only when the user turned it on', async () => {
      const user = await registerUser('Ivy', 'ivy@example.com')
      const api = apiClient({ cookie: user.cookie })
      await api.json('PATCH', pushApi.me.channels, { topics: { 'shifts.reminder': { sms: true } } })
      const content = { userId: user.id, topic: 'shifts.reminder', sms: { body: 'You work 18:00' } }
      await getTexts(true)

      // Enabled, but there is no number: skipped, nothing sent.
      expect(await notify(content)).toMatchObject({ channels: [], skipped: { sms: 'unavailable' } })
      expect(await getTexts()).toEqual([])

      await setPhone('ivy@example.com', '+15550100101')
      expect(await notify(content)).toMatchObject({ channels: ['sms'] })
      expect(await getTexts()).toEqual([expect.objectContaining({ to: '+15550100101', body: 'You work 18:00' })])

      // A topic that does not offer SMS never sends it.
      await getTexts(true)
      expect(await notify({ userId: user.id, topic: 'broadcast', sms: { body: 'Hi' } })).toMatchObject({ channels: [], skipped: { sms: 'disabled' } })
      expect(await getTexts()).toEqual([])
    })

    it('says why a channel did not go out when there is nothing to send to, and refuses unknown topics', async () => {
      const user = await registerUser('Jon', 'jon@example.com')
      // Push on by default, but no device; email on, but no content.
      const result = await notify({ userId: user.id, topic: 'shifts.reminder', push: { title: 'T', body: 'B' } })
      expect(result).toEqual({ channels: [], skipped: { email: 'no_content', sms: 'disabled', push: 'unavailable' } })

      const response = await fetch('/api/test/notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: user.id, topic: 'made.up' }) })
      expect(response.status).toBe(500)
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
