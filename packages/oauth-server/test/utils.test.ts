import { describe, expect, it } from 'vitest'
import {
  isNativeRedirectUri,
  matchesAllowedRoles,
  normalizeWebsiteUrl,
  parseScope,
  resolveScope,
  validateRedirectUri,
} from '../src/runtime/utils'

describe('matchesAllowedRoles', () => {
  it('treats an empty list as everyone', () => {
    expect(matchesAllowedRoles([], [])).toBe(true)
    expect(matchesAllowedRoles(null, ['member'])).toBe(true)
  })

  it('needs at least one shared role', () => {
    expect(matchesAllowedRoles(['staff'], ['member'])).toBe(false)
    expect(matchesAllowedRoles(['staff', 'member'], ['member'])).toBe(true)
    expect(matchesAllowedRoles(['staff'], [])).toBe(false)
  })
})

describe('scopes', () => {
  it('parses and de-duplicates', () => {
    expect(parseScope(' openid  profile openid ')).toEqual(['openid', 'profile'])
  })

  it('falls back to the defaults and drops unsupported scopes', () => {
    const supported = ['openid', 'profile', 'email', 'groups']
    expect(resolveScope(undefined, supported)).toEqual(['openid', 'profile', 'email'])
    expect(resolveScope('openid groups nope', supported)).toEqual(['openid', 'groups'])
    expect(resolveScope('nope', supported)).toEqual([])
  })
})

describe('normalizeWebsiteUrl', () => {
  it('accepts an https origin and localhost over http', () => {
    expect(normalizeWebsiteUrl('https://app.example.com/')).toBe('https://app.example.com')
    expect(normalizeWebsiteUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('rejects plain http, paths and garbage', () => {
    expect(() => normalizeWebsiteUrl('http://app.example.com')).toThrow()
    expect(() => normalizeWebsiteUrl('https://app.example.com/path')).toThrow()
    expect(() => normalizeWebsiteUrl('nope')).toThrow()
  })
})

describe('validateRedirectUri', () => {
  const rules = { websiteUrl: 'https://app.example.com', previewUrlPattern: 'https://*.vercel.app', redirectUris: ['https://app.example.com/other'] }

  it('allows the derived callback, explicit extras and preview deployments', () => {
    expect(validateRedirectUri('https://app.example.com/auth/frigear', rules)).toBe(true)
    expect(validateRedirectUri('https://app.example.com/other', rules)).toBe(true)
    expect(validateRedirectUri('https://pr-12.vercel.app/auth/frigear', rules)).toBe(true)
  })

  it('rejects everything else', () => {
    expect(validateRedirectUri('https://evil.example.com/auth/frigear', rules)).toBe(false)
    expect(validateRedirectUri('https://app.example.com/auth/frigear#x', rules)).toBe(false)
    expect(validateRedirectUri('http://app.example.com/auth/frigear', rules)).toBe(false)
    // `*` is a single host label: no dots, so it cannot smuggle in another domain.
    expect(validateRedirectUri('https://evil.com.vercel.app/auth/frigear', rules)).toBe(false)
    expect(validateRedirectUri('https://x.vercel.app.evil.com/auth/frigear', rules)).toBe(false)
    expect(validateRedirectUri('not a url', rules)).toBe(false)
  })

  it('honours a custom callback path', () => {
    expect(validateRedirectUri('https://app.example.com/cb', { websiteUrl: 'https://app.example.com', callbackPath: '/cb' })).toBe(true)
  })
})

describe('isNativeRedirectUri', () => {
  it('accepts private-use schemes and webview origins', () => {
    expect(isNativeRedirectUri('com.example.app:/callback')).toBe(true)
    expect(isNativeRedirectUri('com.example.app://callback')).toBe(true)
    expect(isNativeRedirectUri('capacitor://localhost/auth/callback')).toBe(true)
    expect(isNativeRedirectUri('myapp://oauth')).toBe(true)
  })

  it('rejects web, dangerous and malformed URIs', () => {
    for (const uri of [
      'https://app.example.com/cb',
      'http://localhost:3000/cb',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'blob:https://app.example.com/x',
      'ftp://example.com/x',
      'mailto:a@example.com',
      'com.example.app:/callback#fragment',
      'com.example.app://user:pass@host/cb',
      'com.example.*:/callback',
      'com.example.app:/*',
      'not a url',
      '',
    ]) expect(isNativeRedirectUri(uri), uri).toBe(false)
  })
})

describe('validateRedirectUri for native apps', () => {
  const rules = { websiteUrl: 'https://app.example.com', redirectUris: ['com.example.app:/callback', 'capacitor://localhost/auth/callback'] }

  it('only accepts listed native URIs, and only for public clients', () => {
    expect(validateRedirectUri('com.example.app:/callback', { ...rules, allowNativeRedirects: true })).toBe(true)
    expect(validateRedirectUri('capacitor://localhost/auth/callback', { ...rules, allowNativeRedirects: true })).toBe(true)
    expect(validateRedirectUri('com.example.app:/callback', rules)).toBe(false)
    expect(validateRedirectUri('com.example.app:/callback', { ...rules, allowNativeRedirects: false })).toBe(false)
  })

  it('matches exactly: no prefixes, case changes or other paths', () => {
    const publicRules = { ...rules, allowNativeRedirects: true }
    expect(validateRedirectUri('com.example.app:/callback/extra', publicRules)).toBe(false)
    expect(validateRedirectUri('com.example.app:/other', publicRules)).toBe(false)
    expect(validateRedirectUri('com.example.app:/callback?x=1', publicRules)).toBe(false)
    expect(validateRedirectUri('com.evil.app:/callback', publicRules)).toBe(false)
    expect(validateRedirectUri('capacitor://localhost/other', publicRules)).toBe(false)
  })

  it('does not let an unlisted dangerous scheme through even when public', () => {
    const publicRules = { websiteUrl: 'https://app.example.com', redirectUris: ['javascript:alert(1)'], allowNativeRedirects: true }
    expect(validateRedirectUri('javascript:alert(1)', publicRules)).toBe(false)
  })

  it('still applies the https rules to web redirects of a public client', () => {
    const publicRules = { websiteUrl: 'https://app.example.com', allowNativeRedirects: true }
    expect(validateRedirectUri('https://app.example.com/auth/frigear', publicRules)).toBe(true)
    expect(validateRedirectUri('http://app.example.com/auth/frigear', publicRules)).toBe(false)
  })
})
