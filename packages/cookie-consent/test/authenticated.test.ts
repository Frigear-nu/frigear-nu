import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { fetch, setup } from '@nuxt/test-utils/e2e'
import { apiClient, expectApiError } from '@frigear-nu/module-kit/testing'
import { DEFAULT_CATEGORIES, computeVersion, cookieConsentApi } from '../src/runtime/utils'
import { authApi } from '@frigear-nu/auth/api'

const version = computeVersion('test', DEFAULT_CATEGORIES)

async function registerAndGetCookie(email: string) {
  const response = await fetch(authApi.register, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ada Lovelace', email, password: 'supersecret123' }),
  })
  expect(response.status, await response.text()).toBe(201)
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('Expected a session cookie after registering.')
  return cookie
}

describe('cookie-consent persisted on the user', async () => {
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/authenticated', import.meta.url)),
    // dev mode lets NuxtHub apply the committed sqlite migrations (incl. the consent columns).
    dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000,
  })

  const api = cookieConsentApi.root

  it('requires a session', async () => {
    await expectApiError(apiClient().json('GET', api), 401, 'unauthorized')
    await expectApiError(apiClient().json('POST', api, { categories: {}, version }), 401, 'unauthorized')
  })

  it('rejects an outdated version and unknown categories', async () => {
    const user = apiClient({ cookie: await registerAndGetCookie('invalid@example.com') })
    await expectApiError(user.json('POST', api, { categories: { analytics: true }, version: 'stale' }), 409, 'outdated_version')
    await expectApiError(user.json('POST', api, { categories: { bogus: true }, version }), 400, 'unknown_categories')
    await expectApiError(user.json('POST', api, { categories: 'all', version }), 400)
  })

  it('stores timestamp, version and categories and returns them like GET does', async () => {
    const user = apiClient({ cookie: await registerAndGetCookie('ada@example.com') })
    expect(await user.json('GET', api)).toEqual({ consent: null })

    const saved = await user.json<{ consent: { v: string, ts: number, categories: Record<string, boolean> } }>('POST', api, {
      categories: { analytics: true, marketing: false },
      version,
    })
    expect(saved.consent.v).toBe(version)
    expect(saved.consent.categories).toEqual({ necessary: true, analytics: true, marketing: false })

    expect(await user.json('GET', api)).toEqual(saved)
  })

  it('keeps consent session-only: a token, even with full access, cannot read or write it', async () => {
    const cookie = await registerAndGetCookie('tokens@example.com')
    const created = await apiClient({ cookie }).fetch('POST', authApi.me.tokens, { name: 'test', scopes: ['*'] })
    expect(created.status, await created.clone().text()).toBe(201)
    const { token } = await created.json() as { token: string }

    const bearer = apiClient({ bearer: token })
    await expectApiError(bearer.fetch('GET', api), 403)
    await expectApiError(bearer.fetch('POST', api, { categories: {}, version }), 403)
  })
})
