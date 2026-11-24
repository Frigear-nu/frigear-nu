import { describe, expect, it } from 'vitest'
import { classifyDeepLink, isInAppPath } from '../../src/runtime/shared/deep-links'
import { detectOs, isTauri } from '../../src/runtime/shared/native'

describe('classifyDeepLink', () => {
  const options = { schemes: ['nu.frigear.crew'], isCallbackUrl: (url: string) => url.startsWith('nu.frigear.crew:/auth/callback') }

  it('leaves OAuth callbacks to auth', () => {
    expect(classifyDeepLink('nu.frigear.crew:/auth/callback?code=1', options)).toEqual({ type: 'oauth' })
  })
  it('routes the app schemes', () => {
    expect(classifyDeepLink('nu.frigear.crew:/shifts/1?tab=a#x', options)).toEqual({ type: 'route', path: '/shifts/1?tab=a#x' })
    expect(classifyDeepLink('NU.FRIGEAR.CREW://shifts/1', options)).toEqual({ type: 'route', path: '/shifts/1' })
    expect(classifyDeepLink('nu.frigear.crew:', options)).toEqual({ type: 'route', path: '/' })
  })
  it('never leaves the app', () => {
    const link = classifyDeepLink('nu.frigear.crew:////evil.example/x', options)
    expect(link).toEqual({ type: 'route', path: '/evil.example/x' })
    expect(classifyDeepLink('nu.frigear.crew:/\\evil.example', options)).toEqual({ type: 'route', path: '/evil.example' })
  })
  it('ignores other links', () => {
    expect(classifyDeepLink('https://example.com/x', options)).toEqual({ type: 'ignore', reason: 'unknown-scheme' })
    expect(classifyDeepLink('other:/x', options)).toEqual({ type: 'ignore', reason: 'unknown-scheme' })
    expect(classifyDeepLink('not a url', options)).toEqual({ type: 'ignore', reason: 'invalid' })
  })
  it('checks paths a hook returns', () => {
    expect(isInAppPath('/a?b=//c')).toBe(true)
    expect(isInAppPath('//evil.example')).toBe(false)
    expect(isInAppPath('/\\evil.example')).toBe(false)
    expect(isInAppPath('https://evil.example')).toBe(false)
  })
})

describe('environment', () => {
  it('detects Tauri', () => {
    expect(isTauri({})).toBe(false)
    expect(isTauri({ isTauri: true })).toBe(true)
    expect(isTauri({ __TAURI_INTERNALS__: {} })).toBe(true)
    expect(isTauri({ __TAURI_INTERNALS__: null })).toBe(false)
  })
  it('detects the OS from the webview user agent', () => {
    expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15')).toBe('macos')
    expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/120.0')).toBe('windows')
    expect(detectOs('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15')).toBe('linux')
    expect(detectOs(undefined)).toBe('unknown')
  })
})
