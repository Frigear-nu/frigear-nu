import { describe, expect, it } from 'vitest'
import { classifyLink, hostUrl, resolveHostBase, resolveHostOption } from '../../src/runtime/shared/host'

describe('resolveHostOption', () => {
  it('is off unless set', () => {
    expect(resolveHostOption(undefined).host).toEqual({ enabled: false, url: '', routes: false, links: false })
    expect(resolveHostOption(false).host.enabled).toBe(false)
  })
  it('takes true (the issuer), a URL or options', () => {
    expect(resolveHostOption(true).host).toEqual({ enabled: true, url: '', routes: true, links: true })
    expect(resolveHostOption('https://frigear.nu/').host).toEqual({ enabled: true, url: 'https://frigear.nu', routes: true, links: true })
    expect(resolveHostOption({ url: 'https://example.com', links: false }).host).toEqual({ enabled: true, url: 'https://example.com', routes: true, links: false })
  })
  it('refuses a URL that is not http(s)', () => {
    expect(resolveHostOption('ftp://example.com').errors).toHaveLength(1)
    expect(resolveHostOption('example.com').errors).toHaveLength(1)
  })
})

describe('resolveHostBase', () => {
  it('uses the URL, else the issuer', () => {
    expect(resolveHostBase({ url: 'https://example.com/site/', issuer: 'https://id.example.com' })).toBe('https://example.com/site')
    expect(resolveHostBase({ url: '', issuer: 'https://id.example.com' })).toBe('https://id.example.com')
    expect(resolveHostBase({ url: '' })).toBeUndefined()
  })
  it('rewrites a loopback host as Auth does for the issuer', () => {
    expect(resolveHostBase({ url: '', issuer: 'http://localhost:3000', rewriteLoopback: '192.168.1.20' })).toBe('http://192.168.1.20:3000')
    expect(resolveHostBase({ url: '', issuer: 'http://localhost:3000', rewriteLoopback: true, dev: true, pageHostname: '192.168.1.20' })).toBe('http://192.168.1.20:3000')
    // Not in a production build, not to another loopback host, and never a public host.
    expect(resolveHostBase({ url: '', issuer: 'http://localhost:3000', rewriteLoopback: true, dev: false, pageHostname: '192.168.1.20' })).toBe('http://localhost:3000')
    expect(resolveHostBase({ url: '', issuer: 'http://localhost:3000', rewriteLoopback: true, dev: true, pageHostname: 'localhost' })).toBe('http://localhost:3000')
    expect(resolveHostBase({ url: 'https://frigear.nu', rewriteLoopback: '192.168.1.20' })).toBe('https://frigear.nu')
  })
})

describe('hostUrl', () => {
  it('puts a path below the base and keeps an absolute URL', () => {
    expect(hostUrl('https://frigear.nu', '/en/events/summer?x=1#t')).toBe('https://frigear.nu/en/events/summer?x=1#t')
    expect(hostUrl('https://frigear.nu/site', 'admin')).toBe('https://frigear.nu/site/admin')
    expect(hostUrl('https://frigear.nu', 'https://example.com/a')).toBe('https://example.com/a')
  })
})

describe('classifyLink', () => {
  const origins = { app: 'capacitor://localhost', host: 'https://frigear.nu' }
  it('tells the app, the website, other sites and other schemes apart', () => {
    expect(classifyLink('/crew', origins)).toBe('app')
    expect(classifyLink('capacitor://localhost/crew', origins)).toBe('app')
    expect(classifyLink('https://frigear.nu/events/x', origins)).toBe('host')
    expect(classifyLink('https://example.com', origins)).toBe('external')
    expect(classifyLink('mailto:hi@example.com', origins)).toBe('other')
    expect(classifyLink('tel:+4512345678', origins)).toBe('other')
  })
  it('works for an app served over http (a browser, Android)', () => {
    expect(classifyLink('/crew', { app: 'http://localhost:3001', host: 'http://localhost:3000' })).toBe('app')
    expect(classifyLink('http://localhost:3000/sign-up', { app: 'http://localhost:3001', host: 'http://localhost:3000' })).toBe('host')
  })
})
