import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadNuxt } from '@nuxt/kit'
import { resolveRule } from '../src/runtime/utils'
import type { RouteRule } from '../src/runtime/utils/types'

const fixture = fileURLToPath(new URL('./fixtures/client-guarded', import.meta.url))

// Client mode: the rules ship to the app, which decides on the client. The login and callback pages stay open.
describe('client mode: guards', () => {
  it('runs without a server and leaves the sign-in pages open under `/**`', async () => {
    const nuxt = await loadNuxt({ cwd: fixture, dev: false, ready: true })
    const installed = nuxt.options._installedModules.map(({ meta }) => meta.name)
    for (const name of ['@nuxthub/core', '@frigear-nu/users', 'auth-utils']) expect(installed).not.toContain(name)
    expect(installed).toEqual(expect.arrayContaining(['@frigear-nu/auth', '@frigear-nu/authorization']))
    expect(nuxt.options.serverHandlers.map(handler => String(handler.handler))).not.toEqual(expect.arrayContaining([expect.stringContaining('authorization')]))

    const { routes, exempt } = nuxt.options.runtimeConfig.public.authorization as { routes: Record<string, RouteRule>, exempt: string[] }
    expect(exempt).toEqual(['/login', '/auth/callback'])
    expect(resolveRule(routes, '/login', exempt)).toBeUndefined()
    expect(resolveRule(routes, '/auth/callback', exempt)).toBeUndefined()
    expect(resolveRule(routes, '/', exempt)).toEqual({ authenticated: true })
    expect(resolveRule(routes, '/admin/users', exempt)).toEqual({ authenticated: true, permission: 'admin:access' })
    // `definePageMeta({ authorize })` reaches `pages:resolved` (Mobile's no-guard warning reads it).
    expect(nuxt.options.experimental.extraPageMetaExtractionKeys).toContain('authorize')
    await nuxt.close()
  })

  it('sends guests to the login path by default, unless redirectTo says otherwise', async () => {
    const redirectTo = async (overrides: Record<string, unknown> = {}) => {
      const nuxt = await loadNuxt({ cwd: fixture, dev: false, ready: true, overrides })
      const value = (nuxt.options.runtimeConfig.public.authorization as { redirectTo?: string }).redirectTo
      await nuxt.close()
      return value
    }
    expect(await redirectTo()).toBe('/login')
    expect(await redirectTo({ authentication: { client: { redirect: { login: '/signin' } } } })).toBe('/signin')
    expect(await redirectTo({ authorization: { redirectTo: '/welcome' } })).toBe('/welcome')
    expect(await redirectTo({ authorization: { redirectTo: false } })).toBeUndefined()
  })

  it('exempts the sign-in pages under every i18n locale prefix too', async () => {
    const nuxt = await loadNuxt({ cwd: fixture, dev: false, ready: true, overrides: { i18n: { locales: ['da', { code: 'en' }] } } as never })
    const { exempt } = nuxt.options.runtimeConfig.public.authorization as { exempt: string[] }
    expect(exempt).toEqual(['/login', '/da/login', '/en/login', '/auth/callback', '/da/auth/callback', '/en/auth/callback'])
    await nuxt.close()
  })

  it('lets an app rule for the exact pattern win', async () => {
    const nuxt = await loadNuxt({
      cwd: fixture,
      dev: false,
      ready: true,
      overrides: { routeRules: { '/auth/callback': { permission: 'admin:access' } as never } },
    })
    const { routes, exempt } = nuxt.options.runtimeConfig.public.authorization as { routes: Record<string, RouteRule>, exempt: string[] }
    expect(resolveRule(routes, '/auth/callback', exempt)).toEqual({ permission: 'admin:access' })
    expect(resolveRule(routes, '/login', exempt)).toBeUndefined()
    await nuxt.close()
  })
})
