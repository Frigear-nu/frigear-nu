import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

describe('basic (module pages, SSR)', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)) })

  it('renders the sign-in page', async () => {
    const html = await $fetch<string>('/login')
    expect(html).toMatch(/<h1[^>]*>\s*Sign in\s*<\/h1>/)
    expect(html).toContain('Sign in with your account to continue.')
  })

  it('renders the callback page while the sign-in completes in the browser', async () => {
    const html = await $fetch<string>('/auth/callback?code=abc&state=xyz')
    expect(html).toContain('Signing you in…')
  })

  it('exposes the resolved public runtime config', async () => {
    const html = await $fetch<string>('/about')
    expect(html).toContain('About the fixture')
    const config = /oauthClient:\{[\s\S]*?rewriteLoopback:\w+\}/.exec(html)?.[0]
    expect(config).toBeDefined()
    expect(config).toContain('issuer:"https://id.example.test"')
    expect(config).toContain('clientId:"fixture-app"')
    expect(config).toContain('scope:"openid profile offline_access"')
    // The app id is lowercased: iOS stores URL schemes lowercase.
    expect(config).toContain('nativeRedirectUri:"nu.frigear.fixture:/auth/callback"')
    expect(config).toContain('protect:"all"')
    expect(config).toContain('publicPaths:["/about"]')
    // Not declared outside development, so a runtime env var can never put a secret into the page.
    expect(config).not.toContain('clientSecret')
  })
})
