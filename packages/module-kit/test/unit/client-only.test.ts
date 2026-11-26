import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Nuxt } from '@nuxt/schema'

const kit = vi.hoisted(() => ({
  addServerHandler: vi.fn(),
  addTypeTemplate: vi.fn(),
  tryUseNuxt: vi.fn(),
}))
vi.mock('@nuxt/kit', async importOriginal => ({ ...await importOriginal<object>(), ...kit }))

const { addModuleRoutes, isClientOnlyApp, markClientOnlyApp, registerSearchIndex, serverModuleDependencies } = await import('../../src/runtime/utils')

const nuxtWith = (options: { modules?: unknown[], moduleKit?: unknown } = {}) =>
  ({ options: { modules: [], ...options }, hook: vi.fn() }) as unknown as Nuxt
const resolver = { resolve: (path: string) => `/pkg/${path.replace('./', '')}` } as never

beforeEach(() => vi.clearAllMocks())

describe('isClientOnlyApp', () => {
  it('is off for a server app', () => {
    expect(isClientOnlyApp(nuxtWith({ modules: ['@nuxt/ui', '@frigear-nu/help-center'] }))).toBe(false)
  })

  it('is on when the app lists @frigear-nu/mobile, with or without options', () => {
    expect(isClientOnlyApp(nuxtWith({ modules: ['@frigear-nu/help-center', '@frigear-nu/mobile'] }))).toBe(true)
    expect(isClientOnlyApp(nuxtWith({ modules: [['@frigear-nu/mobile', { appId: 'nu.frigear.app' }]] }))).toBe(true)
  })

  it('is on once a module marked the app', () => {
    const nuxt = nuxtWith()
    markClientOnlyApp(nuxt)
    expect(isClientOnlyApp(nuxt)).toBe(true)
    expect(isClientOnlyApp(nuxtWith())).toBe(false)
  })

  it('follows `moduleKit.clientOnly` when the app sets it', () => {
    expect(isClientOnlyApp(nuxtWith({ moduleKit: { clientOnly: true } }))).toBe(true)
    const off = nuxtWith({ modules: ['@frigear-nu/mobile'], moduleKit: { clientOnly: false } })
    markClientOnlyApp(off)
    expect(isClientOnlyApp(off)).toBe(false)
  })
})

describe('serverModuleDependencies', () => {
  const hub = { '@nuxthub/core': { version: '>=0.10' } }

  it('keeps the dependencies in a server app and drops them in a client-only one', () => {
    expect(serverModuleDependencies(nuxtWith(), hub)).toEqual(hub)
    expect(serverModuleDependencies(nuxtWith({ moduleKit: { clientOnly: true } }), hub)).toEqual({})
  })
})

describe('server registrations in a client-only app', () => {
  const routes = [{ method: 'get', path: '', file: 'admin/events.get' }] as const

  it('mounts module routes in a server app only', () => {
    kit.tryUseNuxt.mockReturnValue(nuxtWith())
    addModuleRoutes(resolver, [...routes], { base: '/api/admin/events' })
    expect(kit.addServerHandler).toHaveBeenCalledWith({ route: '/api/admin/events', method: 'get', handler: '/pkg/runtime/server/routes/admin/events.get' })

    kit.addServerHandler.mockClear()
    kit.tryUseNuxt.mockReturnValue(nuxtWith({ moduleKit: { clientOnly: true } }))
    addModuleRoutes(resolver, [...routes], { base: '/api/admin/events' })
    expect(kit.addServerHandler).not.toHaveBeenCalled()
  })

  it('registers no search index task', () => {
    const nuxt = nuxtWith({ moduleKit: { clientOnly: true } })
    registerSearchIndex(nuxt, { name: 'users', handler: '/pkg/search-index' })
    expect(nuxt.options._searchIndexes).toBeUndefined()
    expect(nuxt.hook).not.toHaveBeenCalled()
  })
})
