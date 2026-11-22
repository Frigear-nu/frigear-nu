import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { expectApiError, apiClient } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import type { NotificationChannelsDto, NotifyUserResult } from '@frigear-nu/notify/types'
import { preferencesApi } from '../src/runtime/utils/api'
import { preferencesAccess } from '../src/runtime/access'

async function register(email: string) {
  const response = await fetch(authApi.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ada', email, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  return response.headers.get('set-cookie')!
}

async function createToken(cookie: string, scopes: string[]) {
  const response = await fetch(authApi.me.tokens, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ name: 'mobile', scopes }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  return (await response.json() as { token: string }).token
}

const patch = (cookie: string | undefined, body: unknown) => fetch(preferencesApi.root, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
})

describe('preferences API', async () => {
  const dataDir = fileURLToPath(new URL('./fixtures/basic/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
    // Dev mode lets NuxtHub apply the committed migrations on startup.
    dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000,
  })

  it('requires a session', async () => {
    await expectApiError(apiClient().fetch('PATCH', preferencesApi.root, { colorMode: 'dark' }), 401, 'unauthorized')
  })

  it('stores validated preferences and reflects them in the session user', async () => {
    const cookie = await register('prefs-ada@example.com')

    const response = await patch(cookie, { colorMode: 'dark', compactTables: true })
    expect(response.status, await response.clone().text()).toBe(200)
    expect(await response.json()).toEqual({ colorMode: 'dark', compactTables: true })

    const refreshed = response.headers.get('set-cookie')!
    const session = await $fetch<{ user: { preferences: Record<string, unknown> } }>('/api/_auth/session', { headers: { cookie: refreshed } })
    expect(session.user.preferences).toEqual({ colorMode: 'dark', compactTables: true })
  })

  it('merges partial updates and clears a key with null', async () => {
    const cookie = await register('prefs-grace@example.com')
    await patch(cookie, { colorMode: 'light', compactTables: false })

    const response = await patch(cookie, { colorMode: 'system', compactTables: null })
    expect(await response.json()).toEqual({ colorMode: 'system' })
    // The cleared key leaves the session too, and the session stays signed in.
    const session = await $fetch<{ user: { preferences: Record<string, unknown> } }>('/api/_auth/session', { headers: { cookie: response.headers.get('set-cookie')! } })
    expect(session.user.preferences).toEqual({ colorMode: 'system' })
    const again = await patch(response.headers.get('set-cookie')!, {})
    expect(again.status).toBe(200)
  })

  it('rejects unknown keys and invalid values without storing anything', async () => {
    const cookie = await register('prefs-hedy@example.com')

    const api = apiClient({ cookie })
    await expectApiError(api.fetch('PATCH', preferencesApi.root, { nope: true }), 400)
    await expectApiError(api.fetch('PATCH', preferencesApi.root, { colorMode: 'neon' }), 400)
    // One bad key rejects the whole update.
    await expectApiError(api.fetch('PATCH', preferencesApi.root, { compactTables: true, colorMode: 'neon' }), 400)

    const after = await patch(cookie, {})
    expect(await after.json()).toEqual({})
  })

  // Notification channels: this module is notify's choices store and serves the account page's API; users is the
  // recipient store. The fixture registers two topics (`nuxt.config.ts`).
  describe('notification channels', () => {
    const channels = (cookie: string) => apiClient({ cookie }).json<NotificationChannelsDto>('GET', preferencesApi.notifications)
    const change = (cookie: string, topics: Record<string, Record<string, unknown>>) =>
      apiClient({ cookie }).json<NotificationChannelsDto>('PATCH', preferencesApi.notifications, { topics })
    const notify = (body: Record<string, unknown>) => $fetch<NotifyUserResult>('/api/test/notify', { method: 'POST', body })
    const messages = (reset = false) => $fetch<{ mails: Array<Record<string, unknown>>, texts: Array<Record<string, unknown>> }>(`/api/test/messages${reset ? '?reset=1' : ''}`)
    const setPhone = (email: string, phone: string | null) => $fetch<{ id: number }>('/api/test/phone', { method: 'POST', body: { email, phone } })

    it('needs a session, and lists every topic with its defaults', async () => {
      await expectApiError(apiClient().fetch('GET', preferencesApi.notifications), 401, 'unauthorized')
      const cookie = await register('notify-cleo@example.com')
      expect(await channels(cookie)).toEqual({
        hasPhone: false,
        topics: [
          { id: 'shifts.reminder', label: { da: 'Vagtpåmindelser', en: 'Shift reminders' }, channels: ['email', 'sms', 'push'], settings: { email: true, sms: false, push: true }, custom: false },
          { id: 'broadcast', label: 'Broadcasts', channels: ['email', 'push'], settings: { email: true, sms: false, push: false }, custom: false },
        ],
      })
      await setPhone('notify-cleo@example.com', '+15550100101')
      expect((await channels(cookie)).hasPhone).toBe(true)
    })

    it('stores changes per topic and channel as one preference, and keeps the rest', async () => {
      const cookie = await register('notify-dan@example.com')
      const other = await register('notify-eve@example.com')

      const changed = await change(cookie, { 'shifts.reminder': { push: false, sms: true } })
      expect(changed.topics.find(topic => topic.id === 'shifts.reminder')).toMatchObject({ settings: { email: true, sms: true, push: false }, custom: true })
      expect(changed.topics.find(topic => topic.id === 'broadcast')).toMatchObject({ custom: false })

      // A later change keeps what was chosen before; a channel the topic does not offer is ignored.
      await change(cookie, { 'shifts.reminder': { email: false }, 'broadcast': { sms: true, push: true } })
      const after = await channels(cookie)
      expect(after.topics.map(topic => topic.settings)).toEqual([{ email: false, sms: true, push: false }, { email: true, sms: false, push: true }])
      expect((await channels(other)).topics.every(topic => !topic.custom)).toBe(true)

      // The choices are one preference, so the general preferences API reads them back; the session leaves them out.
      const response = await patch(cookie, {})
      expect(await response.json()).toEqual({ notificationChannels: { 'shifts.reminder': { email: false, sms: true, push: false }, 'broadcast': { email: true, sms: false, push: true } } })
      const session = await $fetch<{ user: { preferences: Record<string, unknown> } }>('/api/_auth/session', { headers: { cookie: response.headers.get('set-cookie')! } })
      expect(session.user.preferences).toEqual({})
    })

    it('keeps any number of topics, without growing the session cookie', async () => {
      const cookie = await register('notify-pia@example.com')
      // 40 topics stored directly (more than the fixture registers), as the choices store would for 40 registered ones.
      const many = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`topic.${index}`, { email: false, sms: true, push: true }]))
      const stored = await $fetch<Record<string, unknown>>('/api/test/choices', { method: 'POST', body: { email: 'notify-pia@example.com', choices: many } })
      expect(Object.keys(stored)).toHaveLength(40)

      const response = await patch(cookie, { colorMode: 'dark' })
      const refreshed = response.headers.get('set-cookie')!
      const session = await $fetch<{ user: { preferences: Record<string, unknown> } }>('/api/_auth/session', { headers: { cookie: refreshed } })
      expect(session.user.preferences).toEqual({ colorMode: 'dark' })
      expect(refreshed.length).toBeLessThan(2000)
    })

    it('refuses the choices in the general preferences update, so topics are always checked', async () => {
      const cookie = await register('notify-ola@example.com')
      const api = apiClient({ cookie })
      const error = await expectApiError(api.fetch('PATCH', preferencesApi.root, { notificationChannels: { 'nope.topic': { push: true } } }), 400, 'preference_managed')
      expect(error.data).toMatchObject({ keys: ['notificationChannels'] })
      // Not even a valid topic, and not together with another key: nothing is stored.
      await expectApiError(api.fetch('PATCH', preferencesApi.root, { colorMode: 'dark', notificationChannels: { broadcast: { push: true } } }), 400, 'preference_managed')
      await expectApiError(api.fetch('PATCH', preferencesApi.root, { notificationChannels: null }), 400, 'preference_managed')
      expect(await (await patch(cookie, {})).json()).toEqual({})
      expect((await channels(cookie)).topics.every(topic => !topic.custom)).toBe(true)
    })

    it('takes a token given `preferences:notifications`, and only for the token\'s own user', async () => {
      const cookie = await register('notify-mo@example.com')
      const other = await register('notify-ned@example.com')
      const api = apiClient({ bearer: await createToken(cookie, [preferencesAccess.permissions.notifications]) })

      expect((await api.json<NotificationChannelsDto>('GET', preferencesApi.notifications)).topics).toHaveLength(2)
      const changed = await api.json<NotificationChannelsDto>('PATCH', preferencesApi.notifications, { topics: { broadcast: { push: true } } })
      expect(changed.topics.find(topic => topic.id === 'broadcast')).toMatchObject({ settings: { push: true }, custom: true })
      // The cookie session sees the token's change; nobody else's choices moved.
      expect((await channels(cookie)).topics.find(topic => topic.id === 'broadcast')).toMatchObject({ custom: true })
      expect((await channels(other)).topics.every(topic => !topic.custom)).toBe(true)

      // The named scope works the same.
      const scoped = apiClient({ bearer: await createToken(cookie, ['notifications']) })
      expect((await scoped.json<NotificationChannelsDto>('GET', preferencesApi.notifications)).topics).toHaveLength(2)

      // A token without it is refused, both ways.
      const without = apiClient({ bearer: await createToken(cookie, ['profile:read']) })
      await expectApiError(without.json('GET', preferencesApi.notifications), 403, 'insufficient_scope')
      await expectApiError(without.json('PATCH', preferencesApi.notifications, { topics: { broadcast: { push: false } } }), 403, 'insufficient_scope')

      // The general preferences API stays session only.
      await expectApiError(api.fetch('PATCH', preferencesApi.root, { colorMode: 'dark' }), 403, 'session_required')
    })

    it('refuses unknown topics and malformed bodies without storing anything', async () => {
      const cookie = await register('notify-fay@example.com')
      const error = await expectApiError(change(cookie, { 'nope.topic': { push: true }, 'shifts.reminder': { push: false } }), 400, 'validation_failed')
      expect(JSON.stringify(error.data)).toContain('nope.topic')
      expect((await channels(cookie)).topics.every(topic => !topic.custom)).toBe(true)
      await expectApiError(change(cookie, { broadcast: { fax: true } }), 400)
      await expectApiError(change(cookie, { broadcast: { push: 'yes' } }), 400)
      await expectApiError(apiClient({ cookie }).json('PATCH', preferencesApi.notifications, {}), 400)
    })

    it('notifyUser reaches the user\'s address and number on the channels they chose', async () => {
      const cookie = await register('notify-gus@example.com')
      const { id } = await setPhone('notify-gus@example.com', null)
      const content = {
        userId: id,
        topic: 'shifts.reminder',
        email: { subject: 'Shift tomorrow', body: '<p>18:00</p>', template: { name: 'shifts-reminder' } },
        sms: { body: { da: 'Vagt i morgen', en: 'Shift tomorrow' } },
        push: { title: 'Shift tomorrow', body: '18:00' },
      }
      await messages(true)

      // The defaults: email and push (notify's log driver takes the push), SMS off.
      expect(await notify(content)).toEqual({ channels: ['email', 'push'], skipped: { sms: 'disabled' } })
      expect((await messages(true)).mails).toEqual([{ to: 'notify-gus@example.com', subject: 'Shift tomorrow', body: '<p>18:00</p>', template: { name: 'shifts-reminder' } }])

      // SMS on, but no number yet; then a number.
      await change(cookie, { 'shifts.reminder': { sms: true, email: false } })
      expect(await notify(content)).toEqual({ channels: ['push'], skipped: { email: 'disabled', sms: 'unavailable' } })
      await setPhone('notify-gus@example.com', '+15550100102')
      expect(await notify(content)).toEqual({ channels: ['sms', 'push'], skipped: { email: 'disabled' } })
      expect(await messages(true)).toEqual({ mails: [], texts: [{ to: '+15550100102', body: 'Shift tomorrow' }] })
    })

    it('notifyUser refuses an unknown topic', async () => {
      const response = await fetch('/api/test/notify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 1, topic: 'made.up' }) })
      expect(response.status).toBe(500)
    })
  })
})
