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

    const routes = (nuxt.options.runtimeConfig.public.authorization as { routes: Record<string, RouteRule> }).routes
    expect(routes['/login']).toEqual({ authenticated: false })
    expect(routes['/auth/callback']).toEqual({ authenticated: false })
    expect(resolveRule(routes, '/login')).toBeUndefined()
    expect(resolveRule(routes, '/auth/callback')).toBeUndefined()
    expect(resolveRule(routes, '/')).toEqual({ authenticated: true })
    expect(resolveRule(routes, '/admin/users')).toEqual({ authenticated: true, roles: ['admin'] })
    await nuxt.close()
  })

  it('lets an app rule for the exact pattern win', async () => {
    const nuxt = await loadNuxt({
      cwd: fixture,
      dev: false,
      ready: true,
      overrides: { routeRules: { '/auth/callback': { roles: ['admin'] } as never } },
    })
    const routes = (nuxt.options.runtimeConfig.public.authorization as { routes: Record<string, RouteRule> }).routes
    expect(routes['/auth/callback']).toEqual({ roles: ['admin'] })
    expect(routes['/login']).toEqual({ authenticated: false })
    await nuxt.close()
  })
})
