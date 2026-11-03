import { describe, expect, it } from 'vitest'
import { classifyDeepLink } from '../../src/runtime/shared/deep-links'

const options = {
  schemes: ['nu.frigear.app'],
  hosts: ['app.frigear.nu'],
  isCallbackUrl: (url: string) => url.startsWith('nu.frigear.app:/auth/callback'),
}

describe('classifyDeepLink', () => {
  it('leaves OAuth callbacks to the OAuth client', () => {
    expect(classifyDeepLink('nu.frigear.app:/auth/callback?code=1&state=2', options)).toEqual({ type: 'oauth' })
  })

  it('routes custom-scheme links, with or without an authority', () => {
    expect(classifyDeepLink('nu.frigear.app:/bills/1?tab=x#top', options)).toEqual({ type: 'route', path: '/bills/1?tab=x#top' })
    expect(classifyDeepLink('nu.frigear.app://bills/1', options)).toEqual({ type: 'route', path: '/bills/1' })
    expect(classifyDeepLink('NU.Frigear.App://', options)).toEqual({ type: 'route', path: '/' })
  })

  it('routes universal links of the configured hosts only, over https', () => {
    expect(classifyDeepLink('https://app.frigear.nu/events/2', options)).toEqual({ type: 'route', path: '/events/2' })
    expect(classifyDeepLink('https://APP.frigear.nu//evil.example/x', options)).toEqual({ type: 'route', path: '/evil.example/x' })
    expect(classifyDeepLink('http://app.frigear.nu/events/2', options)).toMatchObject({ type: 'ignore', reason: 'unknown-host' })
    expect(classifyDeepLink('https://other.example/events/2', options)).toMatchObject({ type: 'ignore', reason: 'unknown-host' })
  })

  it('ignores other schemes and garbage', () => {
    expect(classifyDeepLink('otherapp:/bills', options)).toMatchObject({ type: 'ignore', reason: 'unknown-scheme' })
    expect(classifyDeepLink('not a url', options)).toMatchObject({ type: 'ignore', reason: 'invalid' })
  })
})
