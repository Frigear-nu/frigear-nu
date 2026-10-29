import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { authApi } from '../src/runtime/utils/api'

describe('password auth (enabled by default)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/password-enabled', import.meta.url)),
  })

  it('enables password reset in the public runtime config', async () => {
    const html = await $fetch('/')
    expect(html).toContain('passwordReset:true')
  })

  it('registers the login route and validates the request body', async () => {
    await expect($fetch(authApi.login, {
      method: 'POST',
      body: { email: 'not-an-email', password: '' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('registers the register route and validates the request body', async () => {
    await expect($fetch(authApi.register, {
      method: 'POST',
      body: { name: '', email: 'not-an-email', password: 'short' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('caps the name at 120 characters', async () => {
    await expect($fetch(authApi.register, {
      method: 'POST',
      body: { name: 'x'.repeat(121), email: 'ada@example.com', password: 'long-enough-password' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('registers the forgot-password route and validates the request body', async () => {
    await expect($fetch(authApi.forgotPassword, {
      method: 'POST',
      body: { email: 'not-an-email' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('registers the reset-password route and validates the request body', async () => {
    await expect($fetch(authApi.resetPassword, {
      method: 'POST',
      body: { code: '', password: 'short', confirmPassword: 'short' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('validates that reset-password passwords match', async () => {
    await expect($fetch(authApi.resetPassword, {
      method: 'POST',
      body: { code: 'some-code', password: 'new-password123', confirmPassword: 'different-password123' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })
})
