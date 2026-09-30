import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('password auth (enabled by default)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/password-enabled', import.meta.url)),
  })

  it('registers the login route and validates the request body', async () => {
    await expect($fetch('/api/auth/login', {
      method: 'POST',
      body: { email: 'not-an-email', password: '' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('registers the register route and validates the request body', async () => {
    await expect($fetch('/api/auth/register', {
      method: 'POST',
      body: { name: '', email: 'not-an-email', password: 'short' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })
})
