import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'

describe('oauth providers (any nuxt-auth-utils provider, on through its credentials)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/oauth-providers', import.meta.url)),
  })

  it('lists the configured providers, listed ones first with their overrides', async () => {
    expect(await $fetch('/api/auth/providers')).toEqual([
      { key: 'auth0', to: '/api/auth/auth0', label: 'Company SSO', icon: 'i-simple-icons-auth0' },
      { key: 'okta', to: '/api/auth/okta' },
    ])
  })

  it('redirects to the provider of a configured route', async () => {
    const response = await fetch('/api/auth/auth0', { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toMatch(/^https:\/\/example\.auth0\.com\/authorize\?/)
  })

  it('answers 404 for a provider without credentials, turned off, or unknown', async () => {
    for (const provider of ['google', 'github', 'nope']) {
      const response = await fetch(`/api/auth/${provider}`, { redirect: 'manual' })
      expect(response.status, provider).toBe(404)
    }
  })

  it('leaves the static auth routes in front of the provider route', async () => {
    const response = await fetch('/api/auth/scopes')
    expect(response.status).not.toBe(404)
  })

  it('sends an email without an account back to the login page when sign-up is off', async () => {
    const response = await fetch('/test/oauth-user?email=new@example.com', { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/?error=oauth-signup')
  })

  it('refuses an unverified email address', async () => {
    const response = await fetch('/test/oauth-user?email=new@example.com&verified=false', { redirect: 'manual' })
    expect(response.status).toBe(403)
  })
})
