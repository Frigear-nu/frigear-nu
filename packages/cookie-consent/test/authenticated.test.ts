import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { DEFAULT_CATEGORIES, computeVersion } from '../src/runtime/utils'

const version = computeVersion('test', DEFAULT_CATEGORIES)

async function registerAndGetCookie(email: string) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Ada Lovelace', email, password: 'supersecret123' }),
  })
  expect(response.status, await response.text()).toBe(200)
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
    dev: true,
  })

  it('requires a session', async () => {
    await expect($fetch('/api/cookie-consent')).rejects.toMatchObject({ statusCode: 401 })
    await expect($fetch('/api/cookie-consent', { method: 'POST', body: { categories: {}, version } })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects an outdated version and unknown categories', async () => {
    const cookie = await registerAndGetCookie('invalid@example.com')
    await expect($fetch('/api/cookie-consent', { method: 'POST', headers: { cookie }, body: { categories: { analytics: true }, version: 'stale' } }))
      .rejects.toMatchObject({ statusCode: 409 })
    await expect($fetch('/api/cookie-consent', { method: 'POST', headers: { cookie }, body: { categories: { bogus: true }, version } }))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('stores timestamp, version and categories and returns them', async () => {
    const cookie = await registerAndGetCookie('ada@example.com')
    expect(await $fetch('/api/cookie-consent', { headers: { cookie } })).toEqual({ consent: null })

    const saved = await $fetch<{ v: string, ts: number, categories: Record<string, boolean> }>('/api/cookie-consent', {
      method: 'POST',
      headers: { cookie },
      body: { categories: { analytics: true, marketing: false }, version },
    })
    expect(saved.categories).toEqual({ necessary: true, analytics: true, marketing: false })

    expect(await $fetch('/api/cookie-consent', { headers: { cookie } })).toEqual({ consent: saved })
  })
})
