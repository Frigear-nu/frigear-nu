import { fileURLToPath } from 'node:url'
import { rm } from 'node:fs/promises'
import { afterAll, describe, it, expect } from 'vitest'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'

async function registerAndGetCookie(payload: { name: string, email: string, password: string }) {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  expect(response.status, await response.text()).toBe(200)
  const cookie = response.headers.get('set-cookie')
  if (!cookie) throw new Error('Expected a session cookie after registering.')
  return cookie
}

describe('account routes (authenticated)', async () => {
  const dataDir = fileURLToPath(new URL('./fixtures/authenticated/.data', import.meta.url))
  await rm(dataDir, { recursive: true, force: true })
  afterAll(() => rm(dataDir, { recursive: true, force: true }))

  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/authenticated', import.meta.url)),
    // Running in dev mode lets NuxtHub apply the committed sqlite migrations on startup, so the
    // registered session/db flow can be exercised end-to-end against a real (local) database.
    dev: true, serverStartTimeout: 180_000, setupTimeout: 240_000,
  })

  it('issues a 60s signed Frigear ID code for the logged-in user', async () => {
    const cookie = await registerAndGetCookie({ name: 'Hedy Lamarr', email: 'hedy@example.com', password: 'supersecret123' })

    const result = await $fetch<{ idCode: string, payload: string, expiresIn: number }>('/api/account/id-code', { headers: { cookie } })

    expect(result.expiresIn).toBe(60)
    expect(result.payload).toBe(`urn:frigear:id:${result.idCode}`)
    const claims = JSON.parse(Buffer.from(result.idCode.split('.')[1]!, 'base64url').toString())
    expect(claims.exp - claims.iat).toBe(60)
    expect(claims.sub).toBeTruthy()
  })

  it('requires a session for the Frigear ID code', async () => {
    await expect($fetch('/api/account/id-code')).rejects.toMatchObject({ statusCode: 401 })
  })
})
