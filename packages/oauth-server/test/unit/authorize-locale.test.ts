import { beforeEach, describe, expect, it, vi } from 'vitest'

// `ui_locales` on the authorization request: which language the sign-in and consent pages open in.
let i18n: unknown = null
vi.stubGlobal('useOAuthConfig', () => ({ i18n }))

const { authorizeUiLocale, localizeAuthorizePath, parseAuthorizeRequest } = await import('../../src/runtime/server/utils/oauth-authorize')

beforeEach(() => {
  i18n = { strategy: 'prefix_except_default', defaultLocale: 'da', locales: ['da', 'en'] }
})

describe('authorizeUiLocale', () => {
  it('picks the first requested language the app has', () => {
    expect(authorizeUiLocale({ ui_locales: 'sv en-GB da' })).toBe('en')
    expect(authorizeUiLocale({ ui_locales: 'da' })).toBe('da')
  })

  it('is null when none matches, none was asked for, or without i18n', () => {
    expect(authorizeUiLocale({ ui_locales: 'sv de' })).toBeNull()
    expect(authorizeUiLocale({})).toBeNull()
    i18n = null
    expect(authorizeUiLocale({ ui_locales: 'en' })).toBeNull()
  })
})

describe('localizeAuthorizePath', () => {
  it('prefixes the sign-in and consent paths with the requested locale', () => {
    expect(localizeAuthorizePath('/auth/login', { ui_locales: 'en' })).toBe('/en/auth/login')
    expect(localizeAuthorizePath('/authorize', { ui_locales: 'en-GB' })).toBe('/en/authorize')
  })

  it('leaves the default locale, unknown languages and URLs alone', () => {
    expect(localizeAuthorizePath('/auth/login', { ui_locales: 'da' })).toBe('/auth/login')
    expect(localizeAuthorizePath('/auth/login', { ui_locales: 'sv' })).toBe('/auth/login')
    expect(localizeAuthorizePath('/auth/login', {})).toBe('/auth/login')
    expect(localizeAuthorizePath('https://sso.example/login', { ui_locales: 'en' })).toBe('https://sso.example/login')
  })
})

describe('parseAuthorizeRequest', () => {
  it('keeps `ui_locales`', () => {
    const request = parseAuthorizeRequest({
      client_id: 'app_1',
      redirect_uri: 'https://app.example/auth/frigear',
      response_type: 'code',
      state: 'state',
      code_challenge: 'c'.repeat(43),
      code_challenge_method: 'S256',
      ui_locales: 'en da',
    })
    expect(request.ui_locales).toBe('en da')
  })

  it('drops a malformed `ui_locales` instead of failing the request', () => {
    const request = parseAuthorizeRequest({
      client_id: 'app_1',
      redirect_uri: 'https://app.example/auth/frigear',
      response_type: 'code',
      state: 'state',
      code_challenge: 'c'.repeat(43),
      code_challenge_method: 'S256',
      ui_locales: 'x'.repeat(300),
    })
    expect(request.ui_locales).toBeUndefined()
  })
})
