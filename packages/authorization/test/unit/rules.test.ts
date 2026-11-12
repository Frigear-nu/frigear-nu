import { describe, it, expect } from 'vitest'
import { evaluateRule, findUnenforcedPatterns, matchRoute, normalizeAuthorizeMeta, resolveRule, rulePermissions } from '../../src/runtime/utils'

describe('route matching', () => {
  it('matches prefixes, single segments and exact paths', () => {
    expect(matchRoute('/admin/**', '/admin')).toBe(true)
    expect(matchRoute('/admin/**', '/admin/users/1')).toBe(true)
    expect(matchRoute('/admin/**', '/administrator')).toBe(false)
    expect(matchRoute('/posts/*', '/posts/1')).toBe(true)
    expect(matchRoute('/posts/*', '/posts/1/edit')).toBe(false)
    expect(matchRoute('/pricing', '/pricing/')).toBe(true)
    expect(matchRoute('/**', '/anything')).toBe(true)
  })

  it('merges matching patterns per key, most specific last, like Nitro route rules', () => {
    const routes = {
      '/**': { guest: true },
      '/admin/**': { permission: 'admin:access' },
      '/admin/public': { authenticated: false },
      '/admin/*/edit': { permission: 'posts:update' },
      '/members': { authenticated: true },
    }
    expect(resolveRule(routes, '/pricing')).toEqual({ guest: true })
    expect(resolveRule(routes, '/admin/users')).toEqual({ guest: true, permission: 'admin:access' })
    expect(resolveRule(routes, '/admin/public')).toBeUndefined()
    expect(resolveRule(routes, '/admin/7/edit')).toEqual({ guest: true, permission: 'posts:update' })
    expect(resolveRule(routes, '/members')).toEqual({ guest: true, authenticated: true })
    expect(resolveRule(undefined, '/x')).toBeUndefined()
  })
})

describe('rule evaluation', () => {
  const can = (permission: string) => permission === 'posts:read'

  it('returns 401 for guests and 403 without the permission', () => {
    expect(evaluateRule({ permission: 'posts:read' }, false, can)).toMatchObject({ authorized: false, statusCode: 401 })
    expect(evaluateRule({ authenticated: true }, false, can)).toMatchObject({ authorized: false, statusCode: 401 })
    expect(evaluateRule({ permission: 'posts:write' }, true, can)).toMatchObject({ authorized: false, statusCode: 403 })
    expect(evaluateRule({ permission: 'posts:read' }, true, can)).toEqual({ authorized: true })
    expect(evaluateRule({ authenticated: true }, true, can)).toEqual({ authorized: true })
  })

  it('keeps `guest: true` for signed-out visitors only, like auth\'s API middleware', () => {
    expect(evaluateRule({ guest: true }, false, can)).toEqual({ authorized: true })
    expect(evaluateRule({ guest: true }, true, can)).toMatchObject({ authorized: false, statusCode: 403 })
  })

  it('opens everything with `authenticated: false`', () => {
    expect(evaluateRule({ authenticated: false, permission: 'posts:write' }, false, can)).toEqual({ authorized: true })
  })

  it('normalizes page meta', () => {
    expect(normalizeAuthorizeMeta('events:update')).toEqual({ permission: 'events:update' })
    expect(normalizeAuthorizeMeta({ guest: true })).toEqual({ guest: true })
    // `authorize: false` opens the page: no rule, whatever `routeRules` say.
    expect(normalizeAuthorizeMeta(false)).toBeUndefined()
  })

  it('lists the permissions rules name', () => {
    expect(rulePermissions([{ permission: 'b:x' }, undefined, { authenticated: true }, { permission: 'a:x' }, { permission: 'b:x' }])).toEqual(['a:x', 'b:x'])
  })
})

describe('resolveRule with exempt patterns (Auth\'s anonymous entry points)', () => {
  const exempt = ['/login', '/auth/callback', '/api/auth/**']

  it('stops less specific guards at an exempt pattern', () => {
    const routes = { '/**': { authenticated: true }, '/api/**': { permission: 'api:use' } }
    expect(resolveRule(routes, '/login', exempt)).toBeUndefined()
    expect(resolveRule(routes, '/api/auth/login', exempt)).toBeUndefined()
    expect(resolveRule(routes, '/account', exempt)).toEqual({ authenticated: true })
    expect(resolveRule(routes, '/api/members', exempt)).toEqual({ authenticated: true, permission: 'api:use' })
  })

  it('keeps an app rule more specific than the exemption, and lets one for the same pattern win', () => {
    expect(resolveRule({ '/**': { authenticated: true }, '/api/auth/me/tokens': { permission: 'tokens:manage' } }, '/api/auth/me/tokens', exempt)).toEqual({ permission: 'tokens:manage' })
    expect(resolveRule({ '/auth/callback': { permission: 'x:y' } }, '/auth/callback', exempt)).toEqual({ permission: 'x:y' })
  })
})

describe('findUnenforcedPatterns', () => {
  const pages = ['/', '/admin', '/admin/units', '/posts/:id()', '/de/pricing']

  it('lists patterns that match no page and are not under /api/', () => {
    const patterns = ['/admin/**', '/posts/*', '/api/admin/**', '/mcp', '/oauth/**', '/**', '/pricing']
    expect(findUnenforcedPatterns(patterns, pages, ['/de'])).toEqual(['/mcp', '/oauth/**'])
  })

  it('treats a catch-all page as matching everything below it', () => {
    expect(findUnenforcedPatterns(['/docs/guide'], ['/docs/:slug(.*)*'])).toEqual([])
  })
})
