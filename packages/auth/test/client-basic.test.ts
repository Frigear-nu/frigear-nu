import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { filesContaining, outputDir } from './utils/output'

/** `window.__NUXT__.config.public.authentication` of the SPA shell. */
const publicAuthentication = (html: string) => /authentication:\{mode:"client"[\s\S]*?rewriteLoopback:\w+\}\}/.exec(html)?.[0]

describe('client mode (SPA)', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/client-basic', import.meta.url)) })

  it('serves the app as an SPA shell, for the login and callback pages too', async () => {
    for (const path of ['/', '/login', '/auth/callback?code=abc&state=xyz']) {
      const html = await $fetch<string>(path)
      expect(html).toContain('data-ssr="false"')
      expect(html).not.toContain('Fixture home')
    }
  })

  it('publishes the client config, with every server feature off', async () => {
    const config = publicAuthentication(await $fetch<string>('/'))
    expect(config).toBeDefined()
    expect(config).toContain('password:false')
    expect(config).toContain('apiTokens:false')
    expect(config).toContain('oauth:[]')
    expect(config).toContain('pages:{login:"/login"')
    expect(config).toContain('publicPaths:["/login","/auth/callback"]')
    expect(config).toContain('issuer:"https://id.example.test"')
    expect(config).toContain('clientId:"fixture-app"')
    expect(config).toContain('scope:"openid profile offline_access"')
    expect(config).toContain('apiBase:"https://api.example.test"')
    // The app id is lowercased: iOS stores URL schemes lowercase.
    expect(config).toContain('nativeRedirectUri:"nu.frigear.fixture:/auth/callback"')
    expect(config).toContain('redirect:{login:"/login",afterLogin:"/",afterLogout:"/"}')
    // Not declared outside development, so a runtime env var can never put a secret into the page.
    expect(config).not.toContain('clientSecret')
  })

  it('bundles the client login and callback pages', () => {
    const client = outputDir('public')
    expect(filesContaining(client, 'Sign in with your account to continue.')).not.toEqual([])
    expect(filesContaining(client, 'Signing you in…')).not.toEqual([])
  })

  // Bundle exclusion is an acceptance test: client mode builds none of the server mode.
  it.each([
    ['drizzle', /drizzle-orm|drizzle\.config/],
    ['libsql', /@libsql|libsql/],
    ['nuxt-auth-utils', /nuxt-auth-utils|\/api\/_auth\/session/],
    ['the server routes of Auth', /\/api\/auth\/(login|register|bootstrap)/],
  ])('ships no %s', (_name, pattern) => {
    expect(filesContaining(outputDir(), pattern)).toEqual([])
  })
})
