import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch, url } from '@nuxt/test-utils/e2e'
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

  it('throttles failed sign-ins per client and account with 429 and retry-after', async () => {
    const attempt = (email: string) => fetch(authApi.login, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'wrong-password' }),
    })
    for (let index = 0; index < 3; index++) {
      expect((await attempt('target@example.com')).status).toBe(401)
    }
    const refused = await attempt('target@example.com')
    expect(refused.status).toBe(429)
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await refused.json()).data).toMatchObject({ code: 'rate_limited' })
    // Another account from the same client still gets its own attempts.
    expect((await attempt('someone-else@example.com')).status).toBe(401)
  })

  it('refuses sign-in, sign-up and sign-out requests sent from another site', async () => {
    const post = (path: string, headers: Record<string, string>, body: unknown = {}) => fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
    const login = { email: 'csrf@example.com', password: 'wrong-password' }
    const crossSite: Array<Record<string, string>> = [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }, { origin: 'null' }]
    for (const headers of crossSite) {
      for (const [path, body] of [[authApi.login, login], [authApi.logout, {}], [authApi.register, {}], [authApi.magicLinkConfirm, {}], [authApi.resetPassword, {}]] as const) {
        const response = await post(path, headers, body)
        expect(response.status, `${path} ${JSON.stringify(headers)}`).toBe(403)
        expect((await response.json()).data, path).toMatchObject({ code: 'cross_site_request' })
      }
    }
    // The site's own pages (same origin) and clients that send neither header still get through.
    expect((await post(authApi.login, { 'origin': new URL(url('/')).origin, 'sec-fetch-site': 'same-origin' }, login)).status).toBe(401)
    expect((await post(authApi.logout, {})).status).not.toBe(403)
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

  it('refuses a provider callback whose state is missing or does not match the state cookie', async () => {
    const callbacks: Array<[string, Record<string, string>]> = [
      [`${authApi.provider('auth0')}?code=provider-code`, {}],
      [`${authApi.provider('auth0')}?code=provider-code&state=from-the-link`, {}],
      [`${authApi.provider('auth0')}?code=provider-code`, { cookie: 'nuxt-auth-state=in-this-browser' }],
      [`${authApi.provider('auth0')}?code=provider-code&state=from-the-link`, { cookie: 'nuxt-auth-state=in-this-browser' }],
    ]
    for (const [url, headers] of callbacks) {
      const response = await fetch(url, { redirect: 'manual', headers })
      expect(response.status, url).toBe(302)
      expect(response.headers.get('location'), url).toBe('/?error=oauth-state')
      expect(response.headers.get('set-cookie'), url).not.toMatch(/nuxt-session=/)
    }
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
