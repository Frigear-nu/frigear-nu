import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'

const kit = vi.hoisted(() => ({
  addTemplate: vi.fn(),
  addServerTemplate: vi.fn(),
  addTypeTemplate: vi.fn(),
}))
vi.mock('@nuxt/kit', () => kit)

const { bootstrapProvidersTemplate, defineBootstrapRegistry, getBootstrapProviders, registerBootstrapProvider } = await import('../src/runtime/utils/bootstrap')

function fakeNuxt() {
  const hooks: Record<string, () => unknown> = {}
  const nuxt = {
    options: { rootDir: '/app', alias: {} } as Record<string, unknown>,
    hook: (name: string, fn: () => unknown) => { hooks[name] = fn },
  }
  return { nuxt: nuxt as unknown as Nuxt, done: () => hooks['modules:done']!() }
}

beforeEach(() => vi.clearAllMocks())

describe('registerBootstrapProvider', () => {
  it('collects providers in order and resolves relative handlers against rootDir', () => {
    const { nuxt } = fakeNuxt()
    registerBootstrapProvider(nuxt, { scope: 'account', key: 'events:tickets:mine', handler: '/pkg/events/my-tickets' })
    registerBootstrapProvider(nuxt, { scope: 'admin', key: 'stats', handler: './server/bootstrap/stats' })
    registerBootstrapProvider(nuxt, { scope: 'account', key: 'subscriptions:me', handler: '/pkg/subscriptions/me' })

    expect(getBootstrapProviders(nuxt, 'account').map(provider => provider.key)).toEqual(['events:tickets:mine', 'subscriptions:me'])
    expect(getBootstrapProviders(nuxt, 'admin')).toEqual([{ scope: 'admin', key: 'stats', handler: '/app/server/bootstrap/stats' }])
    expect(getBootstrapProviders(nuxt)).toHaveLength(3)
    expect(getBootstrapProviders(nuxt, 'unknown')).toEqual([])
  })

  it('rejects a duplicate key within a scope, but not across scopes', () => {
    const { nuxt } = fakeNuxt()
    registerBootstrapProvider(nuxt, { scope: 'account', key: 'me', handler: '/a' })
    registerBootstrapProvider(nuxt, { scope: 'admin', key: 'me', handler: '/b' })
    expect(() => registerBootstrapProvider(nuxt, { scope: 'account', key: 'me', handler: '/c' })).toThrow(/already registered/)
  })

  it('rejects invalid names and a missing handler', () => {
    const { nuxt } = fakeNuxt()
    expect(() => registerBootstrapProvider(nuxt, { scope: 'account area', key: 'me', handler: '/a' })).toThrow(/invalid scope/)
    expect(() => registerBootstrapProvider(nuxt, { scope: 'account', key: '', handler: '/a' })).toThrow(/invalid key/)
    expect(() => registerBootstrapProvider(nuxt, { scope: 'account', key: 'me', handler: '' })).toThrow(/no handler/)
  })
})

describe('bootstrapProvidersTemplate', () => {
  it('imports every handler and groups them by scope', () => {
    const source = bootstrapProvidersTemplate([
      { scope: 'account', key: 'a', handler: '/x/a.ts' },
      { scope: 'admin', key: 'b', handler: '/x/b.ts' },
      { scope: 'account', key: 'c', handler: '/x/c.ts' },
    ])
    expect(source).toContain('import provider0 from "/x/a.ts"')
    expect(source).toContain('import provider2 from "/x/c.ts"')
    expect(source).toContain('"account": [{ key: "a", handler: provider0 }, { key: "c", handler: provider2 }]')
    expect(source).toContain('"admin": [{ key: "b", handler: provider1 }]')
  })

  it('exports an empty registry without providers', () => {
    expect(bootstrapProvidersTemplate([])).toContain('export const providers = {\n}')
  })
})

describe('defineBootstrapRegistry', () => {
  it('writes #bootstrap/providers as a server template once every module registered', async () => {
    const { nuxt, done } = fakeNuxt()
    defineBootstrapRegistry(nuxt)
    // Registered after the registry was defined, as a module set up later would.
    registerBootstrapProvider(nuxt, { scope: 'account', key: 'me', handler: '/x/me.ts' })
    expect(kit.addServerTemplate).not.toHaveBeenCalled()

    await done()
    expect(kit.addServerTemplate).toHaveBeenCalledTimes(1)
    const { filename, getContents } = kit.addServerTemplate.mock.calls[0]![0] as { filename: string, getContents: () => string }
    expect(filename).toBe('#bootstrap/providers')
    expect(getContents()).toContain('"account": [{ key: "me", handler: provider0 }]')
    expect(kit.addTypeTemplate).toHaveBeenCalledTimes(1)
  })
})
