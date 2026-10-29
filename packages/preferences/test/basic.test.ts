import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, expect, it } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { expectApiError, apiClient } from '@frigear-nu/module-kit/testing'
import { authApi } from '@frigear-nu/auth/utils'
import { preferencesApi } from '../src/runtime/utils/api'

async function register(email: string) {
  const response = await fetch(authApi.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ada', email, password: 'supersecret123' }),
  })
  expect(response.status, await response.clone().text()).toBe(201)
  return response.headers.get('set-cookie')!
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
})
