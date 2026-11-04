import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadNuxt, logger } from '@nuxt/kit'
import type { NuxtConfig } from '@nuxt/schema'

const rootDir = fileURLToPath(new URL('./fixtures/client-checks', import.meta.url))
const load = (overrides: NuxtConfig = {}) => loadNuxt({ cwd: rootDir, dev: false, ready: true, overrides })
const installed = (nuxt: Awaited<ReturnType<typeof load>>) => nuxt.options._installedModules.map(({ meta }) => meta.name).sort()

// The checks client mode runs while Nuxt loads (`setup` and `modules:done`), before anything is built.
describe('client mode: setup', () => {
  it('installs none of the server modules and renders on the client only', async () => {
    const nuxt = await load()
    expect(installed(nuxt)).not.toEqual(expect.arrayContaining(['@nuxthub/core']))
    for (const name of ['@nuxthub/core', 'auth-utils', 'nuxt-auth-utils', '@frigear-nu/notify', '@frigear-nu/menu']) {
      expect(installed(nuxt)).not.toContain(name)
    }
    expect(installed(nuxt)).toContain('@frigear-nu/auth')
    expect(nuxt.options.ssr).toBe(false)
    expect(nuxt.options.alias['#auth-utils']).toMatch(/runtime\/client\/auth-utils$/)
    await nuxt.close()
  })

  it('wires `client.mapUser` and `client.userinfo` into the client plugin', async () => {
    const template = async (nuxt: Awaited<ReturnType<typeof load>>) => {
      const found = nuxt.options.build.templates.find(entry => entry.filename === 'auth/client-user.mjs')
      return found?.getContents?.({ nuxt, app: {} as never, options: {} } as never)
    }
    const plain = await load()
    expect(await template(plain)).toBe('export const mapUser = null\nexport const userinfo = false\n')
    await plain.close()
    const custom = await load({ authentication: { client: { mapUser: './map-user', userinfo: true } } })
    expect(await template(custom)).toMatch(/^export \{ default as mapUser \} from ".*\/fixtures\/client-checks\/map-user\.ts"\nexport const userinfo = true\n$/)
    expect(custom.options.alias['#auth/client-user']).toMatch(/auth\/client-user\.mjs$/)
    await custom.close()
  })

  it('refuses `ssr: true` in the app\'s config', async () => {
    const cwd = fileURLToPath(new URL('./fixtures/client-ssr', import.meta.url))
    await expect(loadNuxt({ cwd, dev: false, ready: true })).rejects.toThrow(/Client mode renders on the client only: remove `ssr: true`/)
  })

  it('refuses scopes without openid', async () => {
    await expect(load({ authentication: { client: { scopes: ['profile'] } } })).rejects.toThrow(/must contain `openid`/)
  })

  it('refuses a scope without openid from the host\'s runtime config', async () => {
    await expect(load({ runtimeConfig: { public: { authentication: { client: { scope: 'profile' } } } } as never }))
      .rejects.toThrow(/client\.scope` must contain `openid`/)
  })

  it('refuses nuxt-auth-utils, naming who installs it', async () => {
    await expect(load({ modules: ['nuxt-auth-utils'] })).rejects.toThrow(/`nuxt-auth-utils` is installed \(by the app\), but client mode has no server/)
  })

  it('names the module that installs nuxt-auth-utils through async moduleDependencies', async () => {
    await expect(load({ modules: ['./local/pulls-auth-utils'] })).rejects.toThrow(/`nuxt-auth-utils` is installed \(by pulls-auth-utils\)/)
  })

  it('refuses @frigear-nu/users, naming who installs it', async () => {
    await expect(load({ modules: [fileURLToPath(new URL('../../users/src/module', import.meta.url))] }))
      .rejects.toThrow(/`@frigear-nu\/users` is installed \(by the app\), but client mode has no server: it needs a database/)
  })

  it('keeps the redirects of client mode on this site', async () => {
    const nuxt = await load({ authentication: { client: { redirect: { afterLogin: '//evil.test', afterLogout: 'https://evil.test' } } } })
    const config = (nuxt.options.runtimeConfig.public.authentication as { client: { redirect: Record<string, string> } }).client
    expect(config.redirect).toMatchObject({ afterLogin: '/', afterLogout: '/' })
    await nuxt.close()
  })

  it('refuses a mode that comes from another module\'s defaults', async () => {
    const cwd = fileURLToPath(new URL('./fixtures/client-module-default', import.meta.url))
    await expect(loadNuxt({ cwd, dev: false, ready: true })).rejects.toThrow(/"client" did not come from the app's config/)
  })

  it('warns when route rules guard pages but Authorization is not installed', async () => {
    // `useLogger` loggers share the reporters of kit's logger.
    const messages: string[] = []
    const reporter = { log: (entry: { type: string, args: unknown[] }) => void (entry.type === 'warn' && messages.push(entry.args.join(' '))) }
    logger.addReporter(reporter)
    try {
      const nuxt = await load({ routeRules: { '/**': { authenticated: true } as never } })
      expect(messages.join('\n')).toMatch(/`\/\*\*`.*`@frigear-nu\/authorization` is not installed/)
      await nuxt.close()
    }
    finally {
      logger.removeReporter(reporter)
    }
  })
})
