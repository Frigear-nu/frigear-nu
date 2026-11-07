import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'
import { authApi } from '../src/runtime/utils/api'

// One build for every suite below.
await setup({
  rootDir: fileURLToPath(new URL('./fixtures/password-enabled', import.meta.url)),
})

describe('password auth (enabled by default)', () => {
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

describe('magic link & email verification', () => {
  it('exposes the enabled features in the public runtime config', async () => {
    const html = await $fetch('/')
    expect(html).toContain('magicLink:true')
    expect(html).toContain('verifyEmail:true')
  })

  it('registers the magic link route and validates the request body', async () => {
    await expect($fetch(authApi.magicLink, {
      method: 'POST',
      body: { email: 'not-an-email' },
    })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('signs in only through the POST, which requires a valid code', async () => {
    await expect($fetch(authApi.magicLinkConfirm, { method: 'POST', body: {} }))
      .rejects.toMatchObject({ statusCode: 400 })
    // Opening the emailed link is a plain page view: no sign-in, no session (the database flow is tested in
    // `@frigear-nu/users`' magic-link-flow test).
    const opened = await fetch('/auth/magic-link?code=nope', { redirect: 'manual' })
    expect(opened.status).not.toBe(302)
    expect(opened.headers.get('set-cookie')).toBeNull()
  })

  it('keeps a listed OAuth provider off until its credentials are set', async () => {
    const response = await fetch(authApi.provider('facebook'), { redirect: 'manual' })
    expect(response.status).toBe(404)
  })
})

describe('oauth providers (any nuxt-auth-utils provider, on through its credentials)', () => {
  it('lists the configured providers, listed ones first with their overrides', async () => {
    expect(await $fetch(authApi.providers)).toEqual([
      { key: 'auth0', to: '/api/auth/auth0', label: 'Company SSO', icon: 'i-simple-icons-auth0' },
      { key: 'okta', to: '/api/auth/okta' },
    ])
  })

  it('redirects to the provider of a configured route', async () => {
    const response = await fetch(authApi.provider('auth0'), { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toMatch(/^https:\/\/example\.auth0\.com\/authorize\?/)
  })

  it('answers 404 for a provider without credentials, turned off, or unknown', async () => {
    for (const provider of ['google', 'github', 'nope']) {
      const response = await fetch(authApi.provider(provider), { redirect: 'manual' })
      expect(response.status, provider).toBe(404)
    }
  })

  it('leaves the static auth routes in front of the provider route', async () => {
    const response = await fetch(authApi.scopes)
    expect(response.status).not.toBe(404)
  })

  it('sends an email without an account back to the login page when sign-up is off', async () => {
    const response = await fetch('/test/oauth-user?email=new@example.com', { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/?error=oauth-signup')
  })

  it('sends an unverified email address back to the login page, linking nothing', async () => {
    const response = await fetch('/test/oauth-user?email=new@example.com&verified=false', { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/?error=oauth-unverified')
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
