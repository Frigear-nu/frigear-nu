import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('password auth (disabled)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/password-disabled', import.meta.url)),
  })

  it('disables password reset in the public runtime config', async () => {
    const html = await $fetch('/')
    expect(html).toContain('passwordReset:false')
  })

  it('does not register the login route', async () => {
    const html = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { email: 'user@example.com', password: 'password' },
    })
    // No route is registered, so the request falls through to the app's SSR fallback
    // instead of returning a JSON response from our login handler.
    expect(html).toContain('<!DOCTYPE html')
  })

  it('does not register the register route', async () => {
    const html = await $fetch('/api/auth/register', {
      method: 'POST',
      body: { name: 'User', email: 'user@example.com', password: 'password123' },
    })
    expect(html).toContain('<!DOCTYPE html')
  })

  it('does not register the forgot-password route', async () => {
    const html = await $fetch('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'user@example.com' },
    })
    expect(html).toContain('<!DOCTYPE html')
  })

  it('does not register the reset-password route', async () => {
    const html = await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { code: 'abc', password: 'password123', confirmPassword: 'password123' },
    })
    expect(html).toContain('<!DOCTYPE html')
  })
})
