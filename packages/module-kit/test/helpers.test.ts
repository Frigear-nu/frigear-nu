import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'

const kit = vi.hoisted(() => ({
  extendPages: vi.fn(),
  addTemplate: vi.fn(),
  addServerTemplate: vi.fn(),
  hasNuxtModule: vi.fn(),
}))
vi.mock('@nuxt/kit', () => kit)

const { addModulePages, addMenuSource, addOptionalMenuSource, defineVirtualRegistry, resolvePagePath } = await import('../src/runtime/utils')

const resolver = { resolve: (path: string) => `/pkg/${path.replace('./', '')}` } as never

function fakeNuxt() {
  const hooks: Record<string, () => unknown> = {}
  const nuxt = {
    options: { alias: {} as Record<string, string> },
    hook: (name: string, fn: () => unknown) => { hooks[name] = fn },
  }
  return { nuxt: nuxt as unknown as Nuxt, run: () => hooks['modules:done']!() }
}

beforeEach(() => vi.clearAllMocks())

describe('resolvePagePath', () => {
  it('maps the opt-in page setting to a path', () => {
    expect(resolvePagePath('/me', '/account')).toBe('/me')
    expect(resolvePagePath(true, '/account')).toBe('/account')
    expect(resolvePagePath(false, '/account')).toBeUndefined()
    expect(resolvePagePath(undefined, '/account')).toBeUndefined()
  })
})

describe('addModulePages', () => {
  const register = (existing: { path?: string }[]) => {
    addModulePages('@acme/events', resolver, [
      { name: 'list', path: '/events', file: './runtime/app/pages/events.vue' },
      { name: 'taken', path: '/taken', file: './runtime/app/pages/taken.vue' },
      { name: 'off', path: undefined, file: './runtime/app/pages/off.vue' },
    ])
    const callback = kit.extendPages.mock.calls[0]![0] as (pages: unknown[]) => void
    callback(existing)
    return existing
  }

  it('adds enabled pages tagged with the module, skipping unset and taken paths', () => {
    const pages = register([{ path: '/taken' }])
    expect(pages).toEqual([
      { path: '/taken' },
      { name: 'list', path: '/events', file: '/pkg/runtime/app/pages/events.vue', meta: { moduleName: '@acme/events' } },
    ])
  })

  it('does nothing when no page has a path', () => {
    addModulePages('@acme/events', resolver, [{ name: 'off', path: undefined, file: './x.vue' }])
    expect(kit.extendPages).not.toHaveBeenCalled()
  })
})

describe('defineVirtualRegistry', () => {
  it('writes the template and aliases it once every module is done', async () => {
    kit.addTemplate.mockReturnValue({ dst: '/build/registry.mjs' })
    const { nuxt, run } = fakeNuxt()
    const resolved = vi.fn()
    defineVirtualRegistry(nuxt, {
      filename: '#things/registry.mjs',
      alias: '#things/registry',
      collect: () => ['a', 'b'],
      contents: items => `export default ${JSON.stringify(items)}`,
      resolved,
    })
    expect(kit.addTemplate).not.toHaveBeenCalled()

    await run()
    const { filename, write, getContents } = kit.addTemplate.mock.calls[0]![0]
    expect({ filename, write, contents: getContents() }).toEqual({ filename: '#things/registry.mjs', write: true, contents: 'export default ["a","b"]' })
    expect(nuxt.options.alias['#things/registry']).toBe('/build/registry.mjs')
    expect(resolved).toHaveBeenCalledWith(['a', 'b'])
  })

  it('adds a server virtual module for the server target', async () => {
    const { nuxt, run } = fakeNuxt()
    defineVirtualRegistry(nuxt, { filename: '#things/handlers', target: 'server', collect: () => 1, contents: n => `export default ${n}` })
    await run()
    expect(kit.addTemplate).not.toHaveBeenCalled()
    expect(kit.addServerTemplate.mock.calls[0]![0].filename).toBe('#things/handlers')
    expect(kit.addServerTemplate.mock.calls[0]![0].getContents()).toBe('export default 1')
  })
})

describe('menu sources', () => {
  const source = { menu: 'dashboard.account', file: '/pkg/runtime/menus' }
  const host = () => ({ options: {} as Record<string, unknown> }) as unknown as Nuxt & { options: { menus?: { _sources?: unknown[] } } }

  it('registers a source once', () => {
    const nuxt = host()
    addMenuSource(nuxt, source)
    addMenuSource(nuxt, source)
    expect(nuxt.options.menus!._sources).toEqual([source])
  })

  it('only registers when the menu module is installed', () => {
    const nuxt = host()
    kit.hasNuxtModule.mockReturnValue(false)
    expect(addOptionalMenuSource(nuxt, source)).toBe(false)
    expect(nuxt.options.menus).toBeUndefined()

    kit.hasNuxtModule.mockReturnValue(true)
    expect(addOptionalMenuSource(nuxt, source)).toBe(true)
    expect(nuxt.options.menus!._sources).toEqual([source])
  })
})
