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
    dev: true,
  })

  it('updates the profile for the logged-in user', async () => {
    const cookie = await registerAndGetCookie({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'supersecret123' })

    const result = await $fetch('/api/account/profile', {
      method: 'POST',
      headers: { cookie },
      body: { name: 'Ada Updated' },
    })

    expect(result).toHaveProperty('id')
  })

  it('validates the profile request body', async () => {
    const cookie = await registerAndGetCookie({ name: 'Grace Hopper', email: 'grace@example.com', password: 'supersecret123' })

    await expect($fetch('/api/account/profile', {
      method: 'POST',
      headers: { cookie },
      body: { name: '' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('changes the email address for the logged-in user', async () => {
    const cookie = await registerAndGetCookie({ name: 'Margaret Hamilton', email: 'margaret@example.com', password: 'supersecret123' })

    const result = await $fetch('/api/account/change-email', {
      method: 'POST',
      headers: { cookie },
      body: { email: 'margaret-new@example.com' },
    })

    expect(result).toHaveProperty('id')
  })

  it('rejects changing the email address to one already in use', async () => {
    await registerAndGetCookie({ name: 'Katherine Johnson', email: 'katherine@example.com', password: 'supersecret123' })
    const cookie = await registerAndGetCookie({ name: 'Dorothy Vaughan', email: 'dorothy@example.com', password: 'supersecret123' })

    await expect($fetch('/api/account/change-email', {
      method: 'POST',
      headers: { cookie },
      body: { email: 'katherine@example.com' },
    })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('changes the password for the logged-in user', async () => {
    const cookie = await registerAndGetCookie({ name: 'Annie Easley', email: 'annie@example.com', password: 'supersecret123' })

    const result = await $fetch('/api/account/change-password', {
      method: 'POST',
      headers: { cookie },
      body: { currentPassword: 'supersecret123', newPassword: 'new-password123', confirmNewPassword: 'new-password123' },
    })

    expect(result).toHaveProperty('id')

    await expect($fetch('/api/auth/login', {
      method: 'POST',
      body: { email: 'annie@example.com', password: 'new-password123' },
    })).resolves.toHaveProperty('id')
  })

  it('rejects an incorrect current password', async () => {
    const cookie = await registerAndGetCookie({ name: 'Mary Jackson', email: 'mary@example.com', password: 'supersecret123' })

    await expect($fetch('/api/account/change-password', {
      method: 'POST',
      headers: { cookie },
      body: { currentPassword: 'wrong-password', newPassword: 'new-password123', confirmNewPassword: 'new-password123' },
    })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('rejects mismatched new passwords', async () => {
    const cookie = await registerAndGetCookie({ name: 'Mae Jemison', email: 'mae@example.com', password: 'supersecret123' })

    await expect($fetch('/api/account/change-password', {
      method: 'POST',
      headers: { cookie },
      body: { currentPassword: 'supersecret123', newPassword: 'new-password123', confirmNewPassword: 'different-password123' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })
})
