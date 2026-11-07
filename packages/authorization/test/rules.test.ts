import { describe, it, expect } from 'vitest'
import {
  allow,
  AuthorizationError,
  authorize,
  allows,
  defineAbility,
  deny,
  denies,
  evaluateRule,
  findUnenforcedPatterns,
  matchRoute,
  normalizeRequestPath,
  resolveRule,
  splitResolvedUser,
  normalizeAuthorizeMeta,
} from '../src/runtime/utils'

type User = { id: number, role: string }
const owner: User = { id: 1, role: 'user' }
const admin: User = { id: 2, role: 'admin' }

const editPost = defineAbility((user: User, post: { userId: number }) =>
  user.id === post.userId || user.role === 'admin' || deny({ message: 'Not your post' }))
const publicFeed = defineAbility({ allowGuest: true }, (user: User | null) => user === null || allow().authorized)

describe('abilities', () => {
  it('injects the user and call-site arguments', async () => {
    expect(await allows(editPost, owner, { userId: 1 })).toBe(true)
    expect(await allows(editPost, admin, { userId: 1 })).toBe(true)
    expect(await denies(editPost, owner, { userId: 9 })).toBe(true)
  })

  it('denies guests before running the policy unless allowGuest is set', async () => {
    expect(await allows(editPost, null, { userId: 1 })).toBe(false)
    expect(await allows(publicFeed, null)).toBe(true)
  })

  it('throws an AuthorizationError carrying the deny() details', async () => {
    await expect(authorize(editPost, owner, { userId: 9 })).rejects.toMatchObject({
      statusCode: 403,
      message: 'Not your post',
    })
    await expect(authorize(editPost, owner, { userId: 9 })).rejects.toBeInstanceOf(AuthorizationError)
  })
})

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
      '/admin/**': { roles: ['admin'] },
      '/admin/public': { authenticated: false },
      '/admin/*/edit': { roles: ['editor'] },
      '/members': { authenticated: true },
    }
    expect(resolveRule(routes, '/pricing')).toEqual({ guest: true })
    expect(resolveRule(routes, '/admin/users')).toEqual({ guest: true, roles: ['admin'] })
    expect(resolveRule(routes, '/admin/public')).toBeUndefined()
    expect(resolveRule(routes, '/admin/7/edit')).toEqual({ guest: true, roles: ['editor'] })
    expect(resolveRule(routes, '/members')).toEqual({ guest: true, authenticated: true })
    expect(resolveRule(undefined, '/x')).toBeUndefined()
  })
})

describe('rule evaluation', () => {
  const abilities = { isAdmin: defineAbility((user: User) => user.role === 'admin') }

  it('returns 401 for guests and 403 for the wrong role', async () => {
    expect(await evaluateRule({ roles: ['admin'] }, null)).toMatchObject({ authorized: false, statusCode: 401 })
    expect(await evaluateRule({ roles: ['admin'] }, owner)).toMatchObject({ authorized: false, statusCode: 403 })
    expect(await evaluateRule({ roles: ['admin'] }, admin)).toEqual({ authorized: true })
  })

  it('lets guests through with `guest: true`', async () => {
    expect(await evaluateRule({ guest: true }, null)).toEqual({ authorized: true })
    expect(await evaluateRule({ guest: true, roles: ['admin'] }, null)).toMatchObject({ authorized: false, statusCode: 403 })
  })

  it('resolves abilities by name or object and passes args', async () => {
    expect(await evaluateRule({ ability: 'isAdmin' }, owner, abilities)).toMatchObject({ authorized: false, statusCode: 403 })
    expect(await evaluateRule({ ability: 'isAdmin' }, admin, abilities)).toEqual({ authorized: true })
    expect(await evaluateRule({ ability: editPost, args: [{ userId: 1 }] }, owner)).toEqual({ authorized: true })
    expect(await evaluateRule({ ability: editPost, args: [{ userId: 5 }] }, owner)).toMatchObject({ authorized: false, message: 'Not your post' })
  })

  it('throws on an unknown ability name', async () => {
    await expect(evaluateRule({ ability: 'nope' }, admin, abilities)).rejects.toThrow('Unknown ability "nope"')
  })

  it('normalizes page meta', () => {
    expect(normalizeAuthorizeMeta('isAdmin')).toEqual({ ability: 'isAdmin' })
    expect(normalizeAuthorizeMeta(editPost)).toEqual({ ability: editPost })
    expect(normalizeAuthorizeMeta({ roles: ['admin'] })).toEqual({ roles: ['admin'] })
    // `authorize: false` opens the page: no rule, whatever `routeRules` say.
    expect(normalizeAuthorizeMeta(false)).toBeUndefined()
  })
})

describe('resolveRule with exempt patterns (Auth\'s anonymous entry points)', () => {
  const exempt = ['/login', '/auth/callback', '/api/auth/**']

  it('stops less specific guards at an exempt pattern', () => {
    const routes = { '/**': { authenticated: true }, '/api/**': { roles: ['admin'] } }
    expect(resolveRule(routes, '/login', exempt)).toBeUndefined()
    expect(resolveRule(routes, '/api/auth/login', exempt)).toBeUndefined()
    expect(resolveRule(routes, '/api/auth/magic-link/confirm', exempt)).toBeUndefined()
    expect(resolveRule(routes, '/account', exempt)).toEqual({ authenticated: true })
    expect(resolveRule(routes, '/api/members', exempt)).toEqual({ authenticated: true, roles: ['admin'] })
  })

  it('keeps an app rule more specific than the exemption', () => {
    const routes = { '/**': { authenticated: true }, '/api/auth/me/tokens': { roles: ['admin'] } }
    expect(resolveRule(routes, '/api/auth/me/tokens', exempt)).toEqual({ roles: ['admin'] })
  })

  it('lets an app rule for the same pattern win', () => {
    const routes = { '/**': { authenticated: true }, '/login': { guest: true, ability: 'isGuest' } }
    expect(resolveRule(routes, '/login', exempt)).toEqual({ guest: true, ability: 'isGuest' })
    expect(resolveRule({ '/auth/callback': { roles: ['admin'] } }, '/auth/callback', exempt)).toEqual({ roles: ['admin'] })
  })

  it('changes nothing without exempt patterns', () => {
    expect(resolveRule({ '/**': { authenticated: true } }, '/login')).toEqual({ authenticated: true })
  })
})

describe('normalizeRequestPath', () => {
  it('returns the path the router dispatches on, without the query', () => {
    expect(normalizeRequestPath('/api/admin/users?x=1')).toBe('/api/admin/users')
    expect(normalizeRequestPath('/api//admin///users')).toBe('/api/admin/users')
    expect(normalizeRequestPath('/')).toBe('/')
    expect(normalizeRequestPath('')).toBe('/')
  })

  it('refuses encoded slashes, backslashes and dot segments', () => {
    for (const path of ['/api/admin%2Fusers', '/api/admin%2fusers', '/api/admin%5Cusers', '/api/admin\\users', '/api/x/../admin/users', '/api/./admin', '/api/%2e%2e/admin', '/api/%2E/admin', '/api/admin/..']) {
      expect(normalizeRequestPath(path), path).toBeNull()
    }
    expect(normalizeRequestPath('/api/admin/users.json')).toBe('/api/admin/users.json')
    expect(normalizeRequestPath('/api/admin/...')).toBe('/api/admin/...')
  })

  it('makes decoded paths hit their rules (h3 decodes `event.path` before routing)', () => {
    const routes = { '/api/admin/**': { roles: ['admin'] }, '/api/admin/units': { roles: ['owner'] } }
    // What h3 hands the router for `/api/%61dmin/users` and `/api/admin/%75nits`.
    const decoded = (raw: string) => normalizeRequestPath(decodeURI(raw))!
    expect(resolveRule(routes, decoded('/api/%61dmin/users'))).toEqual({ roles: ['admin'] })
    expect(resolveRule(routes, decoded('/%61pi/admin/users'))).toEqual({ roles: ['admin'] })
    expect(resolveRule(routes, decoded('/api/admin/%75nits'))).toEqual({ roles: ['owner'] })
  })
})

describe('route rules and the credential kind', () => {
  const session = { kind: 'session', scopes: ['*'] }
  const token = (...scopes: string[]) => ({ kind: 'user-token', scopes })

  it('refuses bearer credentials on a roles or ability rule by default', async () => {
    expect(await evaluateRule({ roles: ['admin'] }, admin, {}, token('*'))).toMatchObject({ authorized: false, statusCode: 403 })
    expect(await evaluateRule({ roles: ['admin'] }, admin, {}, { kind: 'oauth', scopes: ['*'] })).toMatchObject({ authorized: false, statusCode: 403 })
    expect(await evaluateRule({ ability: editPost, args: [{ userId: 2 }] }, admin, {}, token('*'))).toMatchObject({ authorized: false, statusCode: 403 })
    expect(await evaluateRule({ roles: ['admin'] }, admin, {}, session)).toEqual({ authorized: true })
    expect(await evaluateRule({ roles: ['admin'] }, admin)).toEqual({ authorized: true })
  })

  it('accepts any credential on a rule that only asks for a user', async () => {
    expect(await evaluateRule({ authenticated: true }, owner, {}, token('profile:read'))).toEqual({ authorized: true })
    expect(await evaluateRule({ authenticated: true, sessionOnly: true }, owner, {}, token('*'))).toMatchObject({ statusCode: 403 })
  })

  it('lets `scopes` or `sessionOnly: false` opt bearer credentials in', async () => {
    const rule = { roles: ['admin'], scopes: ['reports:read'] }
    expect(await evaluateRule(rule, admin, {}, token('reports:read'))).toEqual({ authorized: true })
    expect(await evaluateRule(rule, admin, {}, token('reports:*'))).toEqual({ authorized: true })
    expect(await evaluateRule(rule, admin, {}, token('profile:read'))).toMatchObject({ statusCode: 403 })
    expect(await evaluateRule(rule, owner, {}, token('reports:read'))).toMatchObject({ statusCode: 403 })
    expect(await evaluateRule({ roles: ['admin'], sessionOnly: false }, admin, {}, token('profile:read'))).toEqual({ authorized: true })
    expect(await evaluateRule({ roles: ['admin'], scopes: ['reports:read'], sessionOnly: true }, admin, {}, token('reports:read'))).toMatchObject({ statusCode: 403 })
  })

  it('merges scopes and sessionOnly like the other keys', () => {
    const routes = { '/api/**': { roles: ['admin'] }, '/api/reports': { scopes: ['reports:read'] } }
    expect(resolveRule(routes, '/api/reports')).toEqual({ roles: ['admin'], scopes: ['reports:read'] })
  })

  it('splits a resolver result into user and credential', () => {
    expect(splitResolvedUser(null)).toEqual({ user: null, credential: null })
    expect(splitResolvedUser({ id: 1, role: 'admin' })).toEqual({ user: { id: 1, role: 'admin' }, credential: null })
    expect(splitResolvedUser({ kind: 'oauth', user: { id: 1 }, scopes: ['openid'] })).toEqual({ user: { id: 1 }, credential: { kind: 'oauth', scopes: ['openid'] } })
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

  it('lists every non-API pattern when the app has no pages', () => {
    expect(findUnenforcedPatterns(['/admin/**', '/api/x'], [])).toEqual(['/admin/**'])
  })
})
