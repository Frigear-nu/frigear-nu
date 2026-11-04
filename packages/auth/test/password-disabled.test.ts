import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'
import { authApi } from '../src/runtime/utils/api'

// One build for every suite below.
await setup({
  rootDir: fileURLToPath(new URL('./fixtures/password-disabled', import.meta.url)),
})

describe('password auth (disabled)', () => {
  it('disables password reset in the public runtime config', async () => {
    const html = await $fetch('/')
    expect(html).toContain('passwordReset:false')
  })

  it('does not register the login route', async () => {
    const html = await $fetch(authApi.login, {
      method: 'POST',
      body: { email: 'user@example.com', password: 'password' },
    })
    // No route is registered, so the request falls through to the app's SSR fallback
    // instead of returning a JSON response from our login handler.
    expect(html).toContain('<!DOCTYPE html')
  })

  it('does not register the register route', async () => {
    const html = await $fetch(authApi.register, {
      method: 'POST',
      body: { name: 'User', email: 'user@example.com', password: 'password123' },
    })
    expect(html).toContain('<!DOCTYPE html')
  })

  it('does not register the forgot-password route', async () => {
    const html = await $fetch(authApi.forgotPassword, {
      method: 'POST',
      body: { email: 'user@example.com' },
    })
    expect(html).toContain('<!DOCTYPE html')
  })

  it('does not register the reset-password route', async () => {
    const html = await $fetch(authApi.resetPassword, {
      method: 'POST',
      body: { code: 'abc', password: 'password123', confirmPassword: 'password123' },
    })
    expect(html).toContain('<!DOCTYPE html')
  })
})

describe('user API tokens (disabled)', () => {
  it('reports them off in the public runtime config', async () => {
    expect(await $fetch('/')).toContain('apiTokens:false')
  })

  it('does not register the token routes', async () => {
    // No route at all, so both fall through to the app's SSR fallback.
    expect(await (await fetch(authApi.me.tokens)).text()).toContain('<!DOCTYPE html')
    const created = await fetch(authApi.me.tokens, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"CI","scopes":[]}' })
    expect(await created.text()).toContain('<!DOCTYPE html')
  })
})

describe('frigear.nu sso (not a preview, no credentials)', () => {
  it('does not expose the login button', async () => {
    expect(await $fetch('/')).toContain('frigearSso:false')
  })

  it('answers 404 from the route', async () => {
    const response = await fetch('/auth/frigear', { redirect: 'manual' })
    expect(response.status).toBe(404)
  })
})
