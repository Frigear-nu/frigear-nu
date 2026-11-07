import { beforeEach, describe, expect, it, vi } from 'vitest'

// Emailed links (magic link, password reset) against a request whose `Host` header names another site.
const inserted: unknown[] = []
const chain: Record<string, unknown> = {}
for (const method of ['select', 'from', 'where', 'orderBy']) chain[method] = () => chain
chain.limit = async () => []
const db = {
  ...chain,
  insert: () => ({
    values: async (values: unknown) => {
      inserted.push(values)
    },
  }),
}
vi.mock('@nuxthub/db', () => ({ db, schema: { magicLinks: {}, passwordResets: {} } }))

let config: { public: { siteUrl?: string }, authentication?: { trustRequestOrigin?: boolean, magicLinkCooldown?: number } } = { public: {} }
const sent: Array<{ to: string, resetUrl: string }> = []
vi.stubGlobal('useRuntimeConfig', () => config)
// What h3's `getRequestURL` makes of the `Host` header.
vi.stubGlobal('getRequestURL', (event: { headers: Record<string, string> }) => new URL(`https://${event.headers.host}/api/auth/x`))
vi.stubGlobal('createOneTimeCode', () => 'the-code')
vi.stubGlobal('enforceAuthRateLimit', async () => {})
vi.stubGlobal('isInternalPath', () => false)
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readValidatedBody', async (_event: unknown, parse: (body: unknown) => unknown) => parse({ email: 'ada@example.com' }))
vi.stubGlobal('useAuthUserStore', () => ({ findByEmail: async () => ({ id: 1, email: 'ada@example.com' }) }))
vi.stubGlobal('dispatchPasswordResetEmail', async (mail: { to: string, resetUrl: string }) => {
  sent.push(mail)
})

const siteUrl = await import('../../src/runtime/server/utils/site-url')
vi.stubGlobal('authSiteOrigin', siteUrl.authSiteOrigin)
vi.stubGlobal('authSiteUrl', siteUrl.authSiteUrl)
const { createMagicLink } = await import('../../src/runtime/server/utils/magic-link')
const forgotPassword = (await import('../../src/runtime/server/routes/session/forgot-password.post')).default as unknown as (event: unknown) => Promise<unknown>

const foreignHost = { headers: { host: 'evil.example' } } as never

beforeEach(() => {
  config = { public: { siteUrl: 'https://site.example/' } }
  inserted.length = 0
  sent.length = 0
})

describe('emailed links', () => {
  it('point a magic link at the configured site, whatever the Host header says', async () => {
    const link = await createMagicLink(foreignHost, { userId: 1 })
    expect(link?.url).toBe('https://site.example/auth/magic-link?code=the-code')
  })

  it('point a password reset link at the configured site, whatever the Host header says', async () => {
    await forgotPassword(foreignHost)
    expect(sent).toEqual([{ to: 'ada@example.com', resetUrl: 'https://site.example/reset-password?code=the-code' }])
  })

  it('fail in production without a site URL, storing nothing', async () => {
    config = { public: {} }
    await expect(createMagicLink(foreignHost, { userId: 1 })).rejects.toMatchObject({ statusCode: 500, data: { code: 'site_url_missing' } })
    await expect(forgotPassword(foreignHost)).rejects.toMatchObject({ statusCode: 500 })
    expect(inserted).toEqual([])
    expect(sent).toEqual([])
  })

  it('use the request origin only when the host trusts it', async () => {
    config = { public: {}, authentication: { trustRequestOrigin: true } }
    expect(siteUrl.authSiteOrigin(foreignHost)).toBe('https://evil.example')
    expect(siteUrl.configuredAuthSiteOrigin()).toBeUndefined()
  })
})
