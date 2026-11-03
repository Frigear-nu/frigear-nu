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

  it('refuses `ssr: true` in the app\'s config', async () => {
    const cwd = fileURLToPath(new URL('./fixtures/client-ssr', import.meta.url))
    await expect(loadNuxt({ cwd, dev: false, ready: true })).rejects.toThrow(/Client mode renders on the client only: remove `ssr: true`/)
  })

  it('refuses scopes without openid', async () => {
    await expect(load({ authentication: { client: { scopes: ['profile'] } } })).rejects.toThrow(/must contain `openid`/)
  })

  it('refuses nuxt-auth-utils, naming who installs it', async () => {
    await expect(load({ modules: ['nuxt-auth-utils'] })).rejects.toThrow(/`nuxt-auth-utils` is installed \(by the app\), but client mode has no server/)
  })

  it('refuses @frigear-nu/oauth-client next to it', async () => {
    await expect(load({ modules: [fileURLToPath(new URL('../../oauth-client/src/module', import.meta.url))] }))
      .rejects.toThrow(/`@frigear-nu\/oauth-client` is installed: it is replaced by/)
  })

  it('refuses a mode that comes from another module\'s defaults', async () => {
    const cwd = fileURLToPath(new URL('./fixtures/client-module-default', import.meta.url))
    await expect(loadNuxt({ cwd, dev: false, ready: true })).rejects.toThrow(/came from a module default \("client"\)/)
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
