import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeUserLocale } from '../../src/runtime/utils/locale'

// The `locale` claim both ways: published from `users.locale` (`oauth:claims` of `@frigear-nu/oauth-server`), and
// stored into it at a frigear.nu login (`auth:frigear:login` of `@frigear-nu/auth`).
const updates: Array<{ values: Record<string, unknown> }> = []
vi.mock('@nuxthub/db', () => ({
  schema: { users: { id: 'users.id' } },
  db: { update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => updates.push({ values }) }) }) },
}))
vi.mock('drizzle-orm', () => ({ eq: (column: unknown, value: unknown) => ({ column, value }) }))
vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
vi.stubGlobal('parseUserLocale', (value: unknown) => normalizeUserLocale(value, ['da', 'en']))

const { addUserLocaleClaim } = await import('../../src/runtime/server/plugins/oauth-claims')
const { storeFrigearLocaleClaim } = await import('../../src/runtime/server/plugins/frigear-locale')

beforeEach(() => {
  updates.length = 0
})

describe('addUserLocaleClaim', () => {
  const ctx = (overrides: Partial<Parameters<typeof addUserLocaleClaim>[0]> = {}) => ({
    user: { locale: 'da' },
    scope: ['openid', 'profile'],
    tokenType: 'id_token',
    claims: {} as Record<string, unknown>,
    ...overrides,
  })

  it('publishes the saved language with the profile scope', () => {
    const id = ctx()
    addUserLocaleClaim(id)
    expect(id.claims.locale).toBe('da')
    const userinfo = ctx({ tokenType: 'userinfo' })
    addUserLocaleClaim(userinfo)
    expect(userinfo.claims.locale).toBe('da')
  })

  it('leaves access tokens bare, needs the profile scope and a saved language, and never replaces a claim', () => {
    for (const context of [ctx({ tokenType: 'access_token' }), ctx({ scope: ['openid'] }), ctx({ user: { locale: null } }), ctx({ user: {} })]) {
      addUserLocaleClaim(context)
      expect(context.claims).toEqual({})
    }
    const taken = ctx({ claims: { locale: 'en' } })
    addUserLocaleClaim(taken)
    expect(taken.claims.locale).toBe('en')
  })
})

describe('storeFrigearLocaleClaim', () => {
  it('stores a claimed language the app has, and hands the updated user back', async () => {
    const ctx = { user: { id: 7, locale: 'da' }, claims: { locale: 'EN' } }
    await storeFrigearLocaleClaim(ctx)
    expect(updates).toEqual([{ values: expect.objectContaining({ locale: 'en' }) }])
    expect(ctx.user).toEqual({ id: 7, locale: 'en' })
  })

  it('changes nothing for the same language, an unknown one or none', async () => {
    for (const claims of [{ locale: 'da' }, { locale: 'sv' }, {}]) {
      const ctx = { user: { id: 7, locale: 'da' }, claims }
      await storeFrigearLocaleClaim(ctx)
      expect(ctx.user).toEqual({ id: 7, locale: 'da' })
    }
    expect(updates).toEqual([])
  })
})
