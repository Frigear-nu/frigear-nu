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
  matchRoute,
  resolveRule,
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

  it('resolves the most specific rule, like Nitro route rules', () => {
    const routes = {
      '/**': { guest: true },
      '/admin/**': { roles: ['admin'] },
      '/admin/public': false,
      '/admin/*/edit': { roles: ['editor'] },
      '/members': true,
    }
    expect(resolveRule(routes, '/pricing')).toEqual({ guest: true })
    expect(resolveRule(routes, '/admin/users')).toEqual({ roles: ['admin'] })
    expect(resolveRule(routes, '/admin/public')).toBeUndefined()
    expect(resolveRule(routes, '/admin/7/edit')).toEqual({ roles: ['editor'] })
    expect(resolveRule(routes, '/members')).toEqual({})
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
  })
})
