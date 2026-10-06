import { describe, expect, it, vi } from 'vitest'
import { createResolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import {
  collectMenuItems,
  defineMenuSource,
  deriveMenuItemId,
  extendMenu,
  matchesMenuGroup,
  parseMenuPath,
  registerMenuSource,
} from '../src/runtime/utils/menu'

function createNuxt(): Nuxt {
  return { options: {}, callHook: vi.fn() } as unknown as Nuxt
}

describe('parseMenuPath', () => {
  it('treats a path without a dot as the root group of that menu', () => {
    expect(parseMenuPath('dashboard')).toEqual({ menu: 'dashboard', group: '', wildcard: false })
  })

  it('splits only on the first dot', () => {
    expect(parseMenuPath('a.b.c')).toEqual({ menu: 'a', group: 'b.c', wildcard: false })
  })

  it('parses a trailing `.*` as a root-group wildcard', () => {
    expect(parseMenuPath('dashboard.*')).toEqual({ menu: 'dashboard', group: '', wildcard: true })
  })

  it('parses a trailing `.*` after a group as a nested-group wildcard', () => {
    expect(parseMenuPath('dashboard.account.*')).toEqual({ menu: 'dashboard', group: 'account', wildcard: true })
  })
})

describe('matchesMenuGroup', () => {
  it('matches every group when the prefix is empty', () => {
    expect(matchesMenuGroup('', '')).toBe(true)
    expect(matchesMenuGroup('account', '')).toBe(true)
    expect(matchesMenuGroup('account.sub', '')).toBe(true)
  })

  it('matches the prefix itself and anything nested under it', () => {
    expect(matchesMenuGroup('account', 'account')).toBe(true)
    expect(matchesMenuGroup('account.sub', 'account')).toBe(true)
    expect(matchesMenuGroup('accounting', 'account')).toBe(false)
    expect(matchesMenuGroup('other', 'account')).toBe(false)
  })
})

describe('collectMenuItems', () => {
  const groups = {
    '': [{ label: 'Root' }],
    'account': [{ label: 'Account' }],
    'account.sub': [{ label: 'Sub' }],
    'other': [{ label: 'Other' }],
  }

  it('returns only the exact group for a plain (non-wildcard) path', () => {
    expect(collectMenuItems(groups, { menu: 'dashboard', group: 'account', wildcard: false })).toEqual([{ label: 'Account' }])
  })

  it('returns every group when the wildcard prefix is empty', () => {
    expect(collectMenuItems(groups, { menu: 'dashboard', group: '', wildcard: true })).toHaveLength(4)
  })

  it('returns the prefix group and every group nested under it for a wildcard prefix', () => {
    expect(collectMenuItems(groups, { menu: 'dashboard', group: 'account', wildcard: true })).toEqual([
      { label: 'Account' },
      { label: 'Sub' },
    ])
  })

  it('returns an empty array when there are no groups for the menu', () => {
    expect(collectMenuItems(undefined, { menu: 'dashboard', group: '', wildcard: false })).toEqual([])
  })
})

describe('deriveMenuItemId', () => {
  it('uses the explicit id when provided', () => {
    expect(deriveMenuItemId({ id: 'custom', label: 'Title', to: '/x' })).toBe('custom')
  })

  it('falls back to `to` when no id is provided', () => {
    expect(deriveMenuItemId({ label: 'Title', to: '/x' })).toBe('/x')
  })

  it('falls back to a slug of `label` when neither id nor to are provided', () => {
    expect(deriveMenuItemId({ label: 'My Cool Item!' })).toBe('my-cool-item')
  })
})

describe('defineMenuSource', () => {
  it('returns the function unchanged', () => {
    const fn = vi.fn()
    expect(defineMenuSource(fn)).toBe(fn)
  })
})

describe('extendMenu', () => {
  it('parses the menu/group from the path and stores normalized items', () => {
    const nuxt = createNuxt()

    extendMenu(nuxt, 'dashboard.more', [{ label: 'Billing' }])

    expect(nuxt.options.menus?._extensions?.dashboard?.more).toEqual([
      { label: 'Billing', group: 'more', id: 'billing' },
    ])
  })

  it('accumulates items registered by different modules into the same menu/group', () => {
    const nuxt = createNuxt()

    extendMenu(nuxt, 'dashboard.more', { label: 'Billing' })
    extendMenu(nuxt, 'dashboard.more', { label: 'Usage' })

    expect(nuxt.options.menus?._extensions?.dashboard?.more).toHaveLength(2)
  })

  it('calls the menus:extend hook with the menu name and normalized items', () => {
    const nuxt = createNuxt()

    extendMenu(nuxt, 'main', { label: 'Home', to: '/' })

    expect(nuxt.callHook).toHaveBeenCalledWith('menus:extend', 'main', [
      { label: 'Home', to: '/', group: '', id: '/' },
    ])
  })

  it('rejects a wildcard path - items can only ever be registered into one exact group', () => {
    const nuxt = createNuxt()

    expect(() => extendMenu(nuxt, 'dashboard.*', { label: 'Billing' })).toThrow(/wildcard/)
  })
})

describe('registerMenuSource', () => {
  it('registers a resolved file path + menu on nuxt.options.menus._sources', () => {
    const nuxt = createNuxt()
    const resolver = createResolver(import.meta.url)
    const file = resolver.resolve('./fixtures/with-items/modules/runtime/menus')

    registerMenuSource(nuxt, { file, menu: 'dashboard' })

    expect(nuxt.options.menus?._sources).toHaveLength(1)
    expect(nuxt.options.menus!._sources![0].menu).toBe('dashboard')
    expect(nuxt.options.menus!._sources![0].file).toContain('runtime/menus')
  })

  it('de-duplicates the same file + menu across multiple registrations', () => {
    const nuxt = createNuxt()
    const resolver = createResolver(import.meta.url)
    const file = resolver.resolve('./fixtures/with-items/modules/runtime/menus')

    registerMenuSource(nuxt, { file, menu: 'dashboard' })
    registerMenuSource(nuxt, { file, menu: 'dashboard' })

    expect(nuxt.options.menus?._sources).toHaveLength(1)
  })
})
