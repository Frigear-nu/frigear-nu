import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { definePreferences } from '../src/runtime/define'
import { applyPreferencePatch, parsePreferencePatch, preferenceClaims, preferencePatchSchema, readPreference, resolvePreferences } from '../src/runtime/utils/registry'

const registry = resolvePreferences([
  definePreferences({
    compactTables: z.boolean(),
    colorMode: { schema: z.enum(['light', 'dark', 'system']), claim: 'color_mode' },
  }),
  // A second definer file, as another module would register.
  definePreferences({
    digest: { schema: z.enum(['daily', 'weekly']), claim: 'digest', scope: 'email' },
  }),
])

describe('resolvePreferences', () => {
  it('merges definer files and normalises both shapes', () => {
    expect([...registry.keys()]).toEqual(['compactTables', 'colorMode', 'digest'])
    expect(registry.get('compactTables')?.claim).toBeUndefined()
    expect(registry.get('compactTables')?.scope).toBe('profile')
    expect(registry.get('colorMode')).toMatchObject({ claim: 'color_mode', scope: 'profile' })
    expect(registry.get('digest')).toMatchObject({ claim: 'digest', scope: 'email' })
  })

  it('refuses the same key in two files', () => {
    expect(() => resolvePreferences([
      definePreferences({ colorMode: z.string() }),
      definePreferences({ colorMode: z.string() }),
    ])).toThrow('"colorMode" is defined more than once')
  })
})

describe('preferencePatchSchema', () => {
  const schema = preferencePatchSchema(registry)

  it('accepts valid values and null, and applies them to the stored preferences', () => {
    const patch = schema.parse({ colorMode: 'dark', compactTables: null })
    expect(patch).toEqual({ colorMode: 'dark', compactTables: null })
    expect(applyPreferencePatch({ compactTables: true, digest: 'daily' }, patch)).toEqual({ colorMode: 'dark', digest: 'daily' })
  })

  it('keeps only the keys that were sent, even when a definition has a default', () => {
    const withDefault = resolvePreferences([definePreferences({ pageSize: z.number().default(25), colorMode: z.string() })])
    expect(parsePreferencePatch(withDefault, { colorMode: 'dark' })).toEqual({ colorMode: 'dark' })
  })

  it('rejects unknown keys, invalid values and non-objects', () => {
    expect(schema.safeParse({ nope: 1 }).success).toBe(false)
    expect(schema.safeParse({ colorMode: 'neon' }).success).toBe(false)
    expect(schema.safeParse('dark').success).toBe(false)
    expect(schema.safeParse([]).success).toBe(false)
  })
})

describe('readPreference', () => {
  it('returns stored values that still satisfy the schema', () => {
    expect(readPreference(registry, { colorMode: 'dark' }, 'colorMode')).toBe('dark')
    expect(readPreference(registry, { colorMode: 'neon' }, 'colorMode')).toBeUndefined()
    expect(readPreference(registry, null, 'colorMode')).toBeUndefined()
    expect(readPreference(registry, { colorMode: 'dark' }, 'unknown')).toBeUndefined()
  })
})

describe('preferenceClaims', () => {
  const stored = { colorMode: 'dark', compactTables: true, digest: 'weekly' }

  it('forwards only preferences that opted in, for the granted scope', () => {
    expect(preferenceClaims(registry, stored, { tokenType: 'userinfo', scope: ['openid', 'profile'] })).toEqual({ color_mode: 'dark' })
    expect(preferenceClaims(registry, stored, { tokenType: 'id_token', scope: ['openid', 'profile', 'email'] })).toEqual({ color_mode: 'dark', digest: 'weekly' })
  })

  it('adds nothing without the scope, for access tokens, or when unset', () => {
    expect(preferenceClaims(registry, stored, { tokenType: 'id_token', scope: ['openid'] })).toEqual({})
    expect(preferenceClaims(registry, stored, { tokenType: 'access_token', scope: ['profile'] })).toEqual({})
    expect(preferenceClaims(registry, {}, { tokenType: 'userinfo', scope: ['profile'] })).toEqual({})
  })
})
