import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadNuxt, logger } from '@nuxt/kit'
import type { NuxtConfig } from '@nuxt/schema'

const rootDir = fileURLToPath(new URL('./fixtures/resource-checks', import.meta.url))
const users = fileURLToPath(new URL('../../users/src/module', import.meta.url))
const load = (overrides: NuxtConfig = {}) => loadNuxt({ cwd: rootDir, dev: false, ready: true, overrides })
const installed = (nuxt: Awaited<ReturnType<typeof load>>) => nuxt.options._installedModules.map(({ meta }) => meta.name)
const routes = (nuxt: Awaited<ReturnType<typeof load>>) => nuxt.options.serverHandlers.map(handler => `${handler.method ?? '*'} ${handler.route ?? ''}`)

// The checks resource mode runs while Nuxt loads (`setup` and `modules:done`), before anything is built.
describe('resource mode: setup', () => {
  it('has the client half and a server half without sessions, next to @frigear-nu/users', async () => {
    const nuxt = await load({ modules: ['./local/resolver', users], users: { settings: { admin: true, verifyEmailChange: true } } } as NuxtConfig)
    expect(installed(nuxt)).toEqual(expect.arrayContaining(['@frigear-nu/auth', '@frigear-nu/users', '@nuxthub/core']))
    expect(installed(nuxt)).not.toContain('nuxt-auth-utils')
    expect(installed(nuxt)).not.toContain('auth-utils')
    expect(nuxt.options.ssr).toBe(false)
    expect(nuxt.options.alias['#auth-utils']).toMatch(/runtime\/client\/auth-utils$/)

    const config = nuxt.options.runtimeConfig.public.authentication as { mode: string, publicPaths: string[], password: boolean, apiTokens: boolean, client: { sameOrigin: boolean, issuer: string } }
    expect(config).toMatchObject({ mode: 'resource', password: false, apiTokens: false })
    expect(config.client).toMatchObject({ issuer: 'https://id.example.test', sameOrigin: true })
    expect(config.publicPaths).toEqual(expect.arrayContaining(['/login', '/auth/callback', '/api/auth/**']))

    // What the app's UI reads with the token; no sign-in, session or API token routes.
    const registered = routes(nuxt)
    expect(registered).toEqual(expect.arrayContaining([
      'get /api/auth/me/access',
      'get /api/auth/bootstrap',
      'patch /api/users/me',
      'put /api/users/me/locale',
      'get /api/admin/users',
      'post /api/admin/users',
      'delete /api/admin/users/:id',
    ]))
    // Users: the email address and password belong to the issuer, and no sign-in links are sent.
    for (const absent of [
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/register',
      '/api/auth/me/tokens',
      '/api/auth/scopes',
      '/api/auth/:provider',
      '/api/users/me/email',
      '/api/users/me/password',
      '/api/users/email-change',
      '/api/users/email-change/confirm',
      '/api/admin/users/:id/resend',
    ]) {
      expect(registered.some(route => route.endsWith(` ${absent}`))).toBe(false)
    }
    await nuxt.close()
  })

  it('fails the build without a bearer token resolver', async () => {
    await expect(load()).rejects.toThrow(/Resource mode authenticates every request with a bearer token resolver, and none is registered: install `@frigear-nu\/oauth-resource`/)
  })

  it('refuses nuxt-auth-utils', async () => {
    await expect(load({ modules: ['./local/resolver', 'nuxt-auth-utils'] })).rejects.toThrow(/`nuxt-auth-utils` is installed \(by the app\), but resource mode has no cookie sessions/)
  })

  it('warns about options of sign-in on this server', async () => {
    const messages: string[] = []
    const reporter = { log: (entry: { type: string, args: unknown[] }) => void (entry.type === 'warn' && messages.push(entry.args.join(' '))) }
    logger.addReporter(reporter)
    try {
      const nuxt = await load({ modules: ['./local/resolver'], authentication: { apiTokens: true, settings: { magicLink: true } } })
      expect(messages.join('\n')).toMatch(/`authentication\.apiTokens`, `authentication\.settings\.magicLink` do nothing in resource mode/)
      await nuxt.close()
    }
    finally {
      logger.removeReporter(reporter)
    }
  })
})
