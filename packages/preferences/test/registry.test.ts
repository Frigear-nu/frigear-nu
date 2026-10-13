import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { definePreferences } from '../src/runtime/define'
import { parsePreferencePatch, preferenceClaims, readPreference, resolvePreferences } from '../src/runtime/utils/registry'

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

describe('parsePreferencePatch', () => {
  it('accepts valid values and treats null as clearing', () => {
    expect(parsePreferencePatch(registry, { colorMode: 'dark', compactTables: null })).toEqual({
      ok: true,
      set: { colorMode: 'dark' },
      remove: ['compactTables'],
    })
  })

  it('rejects unknown keys, invalid values and non-objects', () => {
    expect(parsePreferencePatch(registry, { nope: 1 })).toMatchObject({ ok: false, message: 'Unknown preference "nope".' })
    expect(parsePreferencePatch(registry, { colorMode: 'neon' })).toMatchObject({ ok: false, message: 'Invalid value for "colorMode".' })
    expect(parsePreferencePatch(registry, 'dark')).toMatchObject({ ok: false })
    expect(parsePreferencePatch(registry, [])).toMatchObject({ ok: false })
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
