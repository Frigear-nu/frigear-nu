import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('account routes (pages not opted in)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)),
    // Cold builds on shared CI runners can take longer than vitest's 120s default.
    setupTimeout: 240_000,
  })

  it('renders the index page', async () => {
    const html = await $fetch('/')
    expect(html).toContain('<div>basic</div>')
  })

  it('registers the profile route and requires an authenticated session', async () => {
    await expect($fetch('/api/account/profile', {
      method: 'POST',
      body: { name: 'Ada' },
    })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('registers the change-email route and requires an authenticated session', async () => {
    await expect($fetch('/api/account/change-email', {
      method: 'POST',
      body: { email: 'ada@example.com' },
    })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('registers the change-password route and requires an authenticated session', async () => {
    await expect($fetch('/api/account/change-password', {
      method: 'POST',
      body: { currentPassword: 'current', newPassword: 'new-password123', confirmNewPassword: 'new-password123' },
    })).rejects.toMatchObject({ statusCode: 401 })
  })
})
