import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/api'
import { preferencesApi } from '@frigear-nu/preferences/api'
import { dashboardApi } from '../src/runtime/utils/api'
import { dashboardAccess } from '../src/runtime/access'
import { DASHBOARD_LIMITS } from '../src/runtime/preferences'
import type { DashboardLayout, DashboardLayoutsDto } from '../src/types'

const PASSWORD = 'supersecret123'

async function register(email: string) {
  const response = await fetch(authApi.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ada', email, password: PASSWORD }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  return response.headers.get('set-cookie')!
}

async function login(email: string) {
  const response = await fetch(authApi.login, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  expect(response.status, await response.clone().text()).toBe(200)
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

const layout = (order: string[] = [], hidden: string[] = []): DashboardLayout => ({ order, hidden, collapsed: [] })
const stored = (email: string, preferences?: Record<string, unknown>) =>
  $fetch<{ preferences: Record<string, unknown> | null }>('/api/test/preferences', { method: 'POST', body: { email, preferences } })

describe('dashboard layouts API', async () => {
  const dataDir = fileURLToPath(new URL('./fixtures/persisted/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/persisted', import.meta.url)),
    // Dev mode lets NuxtHub apply the committed migrations on startup.
    dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000,
  })

  it('needs a caller, and answers only the caller\'s own layouts', async () => {
    await expectApiError(apiClient().fetch('GET', dashboardApi.me.layouts), 401, 'unauthorized')
    await expectApiError(apiClient().fetch('PATCH', dashboardApi.me.layouts, { layouts: {} }), 401, 'unauthorized')

    const ada = apiClient({ cookie: await register('layouts-ada@example.com') })
    const bob = apiClient({ cookie: await register('layouts-bob@example.com') })
    expect(await ada.json<DashboardLayoutsDto>('GET', dashboardApi.me.layouts)).toEqual({ layouts: {} })

    const saved = await ada.json<DashboardLayoutsDto>('PATCH', dashboardApi.me.layouts, { layouts: { 'crew.home': layout(['b'], ['a']) } })
    expect(saved).toEqual({ layouts: { 'crew.home': layout(['b'], ['a']) } })
    expect(await bob.json<DashboardLayoutsDto>('GET', dashboardApi.me.layouts)).toEqual({ layouts: {} })

    // Partial: other dashboards are kept, `null` removes one.
    await ada.json('PATCH', dashboardApi.me.layouts, { layouts: { 'admin.home': layout(['x']) } })
    expect(await ada.json<DashboardLayoutsDto>('PATCH', dashboardApi.me.layouts, { layouts: { 'crew.home': null } }))
      .toEqual({ layouts: { 'admin.home': layout(['x']) } })
  })

  it('takes a token given dashboard:layouts, and refuses one without it', async () => {
    const cookie = await register('layouts-token@example.com')
    const allowed = apiClient({ bearer: await createToken(cookie, [dashboardAccess.permissions.layouts]) })
    expect(await allowed.json<DashboardLayoutsDto>('PATCH', dashboardApi.me.layouts, { layouts: { 'crew.home': layout(['c']) } }))
      .toEqual({ layouts: { 'crew.home': layout(['c']) } })
    const other = apiClient({ bearer: await createToken(cookie, ['preferences:notifications']) })
    await expectApiError(other.fetch('GET', dashboardApi.me.layouts), 403, 'insufficient_scope')
  })

  it('keeps a large layout out of the session cookie, so signing in still works', async () => {
    const email = 'layouts-large@example.com'
    const cookie = await register(email)
    const ids = Array.from({ length: DASHBOARD_LIMITS.idsPerList }, (_, index) => `module.some-rather-long-item-${index}`)
    const layouts = Object.fromEntries(Array.from({ length: DASHBOARD_LIMITS.dashboards }, (_, index) => [`dashboard-${index}`, layout(ids)]))
    const response = await fetch(dashboardApi.me.layouts, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ layouts }),
    })
    expect(response.status, await response.clone().text()).toBe(200)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(JSON.stringify(await response.json()).length).toBeGreaterThan(100_000)

    // A new sign-in copies the preferences into the cookie: the layouts are left out, so it stays small.
    const fresh = await login(email)
    expect(fresh.length).toBeLessThan(4096)
    const session = await $fetch<{ user: { preferences?: Record<string, unknown> } }>('/api/_auth/session', { headers: { cookie: fresh } })
    expect(session.user.preferences?.dashboardLayouts).toBeUndefined()
    expect(Object.keys((await apiClient({ cookie: fresh }).json<DashboardLayoutsDto>('GET', dashboardApi.me.layouts)).layouts)).toHaveLength(DASHBOARD_LIMITS.dashboards)
  })

  it('refuses the layouts through PATCH /api/preferences (a managed preference)', async () => {
    const api = apiClient({ cookie: await register('layouts-managed@example.com') })
    await expectApiError(api.fetch('PATCH', preferencesApi.root, { dashboardLayouts: { 'crew.home': layout() } }), 400, 'preference_managed')
  })

  it('refuses more layouts than the limit, and an invalid one', async () => {
    const api = apiClient({ cookie: await register('layouts-limit@example.com') })
    const many = Object.fromEntries(Array.from({ length: DASHBOARD_LIMITS.dashboards + 1 }, (_, index) => [`d${index}`, layout()]))
    await expectApiError(api.fetch('PATCH', dashboardApi.me.layouts, { layouts: many }), 400)
    await expectApiError(api.fetch('PATCH', dashboardApi.me.layouts, { layouts: { 'crew.home': { order: 'a' } } }), 400)
    expect(await api.json<DashboardLayoutsDto>('GET', dashboardApi.me.layouts)).toEqual({ layouts: {} })
  })

  it('drops a stored layout that no longer parses instead of failing every save', async () => {
    const email = 'layouts-invalid@example.com'
    const api = apiClient({ cookie: await register(email) })
    await stored(email, { colorMode: 'dark', dashboardLayouts: { 'crew.home': layout(['a']), 'broken': { order: 'a' } } })

    expect(await api.json<DashboardLayoutsDto>('GET', dashboardApi.me.layouts)).toEqual({ layouts: { 'crew.home': layout(['a']) } })
    expect(await api.json<DashboardLayoutsDto>('PATCH', dashboardApi.me.layouts, { layouts: { 'admin.home': layout(['x']) } }))
      .toEqual({ layouts: { 'crew.home': layout(['a']), 'admin.home': layout(['x']) } })
    // Gone from the row too; the other preferences are kept.
    expect((await stored(email)).preferences).toEqual({ colorMode: 'dark', dashboardLayouts: { 'crew.home': layout(['a']), 'admin.home': layout(['x']) } })
  })
})
