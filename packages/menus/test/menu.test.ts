import { describe, expect, it, vi } from 'vitest'
import { createResolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import {
  defineMenuSource,
  deriveMenuItemId,
  extendMenu,
  parseMenuPath,
  registerMenuSource,
} from '../src/runtime/utils/menu'

function createNuxt(): Nuxt {
  return { options: {}, callHook: vi.fn() } as unknown as Nuxt
}

describe('parseMenuPath', () => {
  it('treats a path without a dot as the root group of that menu', () => {
    expect(parseMenuPath('dashboard')).toEqual({ menu: 'dashboard', group: '' })
  })

  it('splits only on the first dot', () => {
    expect(parseMenuPath('a.b.c')).toEqual({ menu: 'a', group: 'b.c' })
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
})

describe('registerMenuSource', () => {
  it('resolves and registers a file path + menu on nuxt.options.menus._sources', async () => {
    const nuxt = createNuxt()
    const resolver = createResolver(import.meta.url)

    await registerMenuSource(nuxt, { resolver, file: './fixtures/with-items/modules/runtime/menus', menu: 'dashboard' })

    expect(nuxt.options.menus?._sources).toHaveLength(1)
    expect(nuxt.options.menus!._sources![0].menu).toBe('dashboard')
    expect(nuxt.options.menus!._sources![0].file).toContain('runtime/menus')
  })

  it('de-duplicates the same resolved file + menu across multiple registrations', async () => {
    const nuxt = createNuxt()
    const resolver = createResolver(import.meta.url)

    await registerMenuSource(nuxt, { resolver, file: './fixtures/with-items/modules/runtime/menus', menu: 'dashboard' })
    await registerMenuSource(nuxt, { resolver, file: './fixtures/with-items/modules/runtime/menus', menu: 'dashboard' })

    expect(nuxt.options.menus?._sources).toHaveLength(1)
  })
})
