import { describe, expect, it } from 'vitest'
import { normalizeRequestPath, pickAccessRouteRules, resolveAccessRouteRule } from '../../src/runtime/utils/route-rules'

describe('access route rules', () => {
  const rules = pickAccessRouteRules({
    '/api/**': { authenticated: true },
    '/api/admin/**': { permission: 'admin:access', cors: true },
    '/api/auth/me/secret': { permission: 'secret:read' },
    '/static/**': { prerender: true },
  })
  const exempt = ['/api/auth/**', '/api/_auth/**']

  it('keeps only the access keys', () => {
    expect(rules).toEqual({
      '/api/**': { authenticated: true },
      '/api/admin/**': { permission: 'admin:access' },
      '/api/auth/me/secret': { permission: 'secret:read' },
    })
  })

  it('lets more specific rules win and exempts auth\'s entry points from less specific ones', () => {
    expect(resolveAccessRouteRule(rules, '/api/admin/users', exempt)).toEqual({ authenticated: true, permission: 'admin:access' })
    expect(resolveAccessRouteRule(rules, '/api/events', exempt)).toEqual({ authenticated: true })
    expect(resolveAccessRouteRule(rules, '/api/auth/login', exempt)).toBeUndefined()
    expect(resolveAccessRouteRule(rules, '/api/_auth/session', exempt)).toBeUndefined()
    expect(resolveAccessRouteRule(rules, '/api/auth/me/secret', exempt)).toEqual({ permission: 'secret:read' })
  })

  it('refuses paths a rule cannot be trusted to match', () => {
    expect(normalizeRequestPath('/api//admin/users?x=1')).toBe('/api/admin/users')
    expect(normalizeRequestPath('/api/admin%2Fusers')).toBeNull()
    expect(normalizeRequestPath('/api/x/../admin')).toBeNull()
    expect(normalizeRequestPath('/api/%2e%2e/admin')).toBeNull()
    expect(normalizeRequestPath('/api\\admin')).toBeNull()
  })
})
