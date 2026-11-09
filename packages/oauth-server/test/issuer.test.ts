import { describe, expect, it, vi } from 'vitest'
import { getRequestURL } from 'h3'
import type { H3Event } from 'h3'

vi.mock('#auth/scopes', () => ({ scopes: [] }))

const config = { issuer: '' as string }
vi.stubGlobal('useRuntimeConfig', () => ({ oauthServer: config }))
vi.stubGlobal('getRequestURL', getRequestURL)

const { getOAuthIssuer } = await import('../src/runtime/server/utils/oauth-config')

const event = (headers: Record<string, string>) => ({
  path: '/.well-known/openid-configuration',
  node: { req: { headers: { host: 'id.example.test', ...headers }, url: '/.well-known/openid-configuration', connection: { encrypted: true } }, res: {} },
}) as unknown as H3Event

describe('getOAuthIssuer', () => {
  it('uses the configured issuer', () => {
    config.issuer = 'https://id.example.test/'
    expect(getOAuthIssuer(event({ 'x-forwarded-host': 'evil.test' }))).toBe('https://id.example.test')
  })

  it('does not take the issuer from x-forwarded-host or x-forwarded-proto when none is configured', () => {
    config.issuer = ''
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(getOAuthIssuer(event({ 'x-forwarded-host': 'evil.test', 'x-forwarded-proto': 'http' }))).toBe('https://id.example.test')
    warn.mockRestore()
  })
})
