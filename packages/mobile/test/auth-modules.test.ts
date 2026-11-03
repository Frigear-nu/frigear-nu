import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadNuxt, logger } from '@nuxt/kit'
import type { NuxtConfig } from '@nuxt/schema'

const rootDir = fileURLToPath(new URL('./fixtures/auth-modules', import.meta.url))
const mobile = fileURLToPath(new URL('../src/module', import.meta.url))
const load = (overrides: NuxtConfig) => loadNuxt({ cwd: rootDir, dev: false, ready: true, overrides })
const installed = (nuxt: Awaited<ReturnType<typeof load>>) => nuxt.options._installedModules.map(({ meta }) => meta.name).filter(Boolean).sort()

const permutations = <T>(items: T[]): T[][] => items.length <= 1
  ? [items]
  : items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(rest => [item, ...rest]))

/** The `warn` messages logged while `fn` runs (`useLogger` loggers share kit's reporters). */
async function warnings(fn: () => Promise<void>) {
  const messages: string[] = []
  const reporter = { log: (entry: { type: string, args: unknown[] }) => void (entry.type === 'warn' && messages.push(entry.args.join(' '))) }
  logger.addReporter(reporter)
  try {
    await fn()
  }
  finally {
    logger.removeReporter(reporter)
  }
  return messages
}

// The mode is the app's own `authentication.mode`: Auth, Authorization and Mobile all read it before any module
// default is merged, so the order the app lists them in changes nothing.
describe('mobile with auth and authorization', () => {
  const orders = permutations([mobile, '@frigear-nu/auth', '@frigear-nu/authorization'])

  it.each(orders.map(order => [order.map(entry => entry === mobile ? 'mobile' : entry.replace('@frigear-nu/', '')).join(', '), order] as const))(
    'installs the same modules in client mode in the order [%s]',
    async (_name, modules) => {
      const nuxt = await load({ modules })
      const names = installed(nuxt)
      expect(names).toEqual(expect.arrayContaining(['@frigear-nu/auth', '@frigear-nu/authorization', '@frigear-nu/mobile']))
      for (const name of ['@nuxthub/core', '@frigear-nu/users', 'auth-utils', '@frigear-nu/oauth-client']) expect(names).not.toContain(name)
      expect(nuxt.options.ssr).toBe(false)
      // Mobile's scalar defaults reach Auth's client options.
      const client = (nuxt.options.runtimeConfig.public as { authentication: { mode: string, client: { nativeRedirectUri: string } } }).authentication
      expect(client.mode).toBe('client')
      expect(client.client.nativeRedirectUri).toBe('nu.frigear.order:/auth/callback')
      const mobileConfig = (nuxt.options.runtimeConfig.public as { mobile: { auth: boolean } }).mobile
      expect(mobileConfig.auth).toBe(true)
      ;(globalThis as { __orders?: string[] }).__orders = [...((globalThis as { __orders?: string[] }).__orders ?? []), names.join(',')]
      await nuxt.close()
    },
  )

  it('installed exactly the same modules each time', () => {
    const seen = new Set((globalThis as { __orders?: string[] }).__orders)
    expect(seen.size).toBe(1)
  })

  it('installs Auth when only `authentication` is configured, not Authorization', async () => {
    const nuxt = await load({ modules: [mobile] })
    expect(installed(nuxt)).toContain('@frigear-nu/auth')
    expect(installed(nuxt)).not.toContain('@frigear-nu/authorization')
    await nuxt.close()
  })

  it('refuses a leftover `oauthClient`, with the migration steps', async () => {
    await expect(load({ modules: [mobile], oauthClient: { issuer: 'https://id.example.test' } } as NuxtConfig))
      .rejects.toThrow(/`oauthClient` is configured, but Mobile now signs in with `@frigear-nu\/auth` in client mode[\s\S]*authentication: \{ mode: 'client'/)
  })

  it.each([
    ['no rule or page meta guards anything', fileURLToPath(new URL('./fixtures/spa', import.meta.url)), [], true],
    ['a route rule guards pages', rootDir, [], false],
    ['a page guards itself', fileURLToPath(new URL('./fixtures/spa', import.meta.url)), [{ path: '/account', meta: { authorize: { authenticated: true } } }], false],
  ])('warns that every page is public only when %s', async (_name, cwd, pages, warned) => {
    const messages = await warnings(async () => {
      const nuxt = await loadNuxt({ cwd, dev: false, ready: true, overrides: cwd === rootDir ? { modules: [mobile, '@frigear-nu/authorization'] } : {} })
      await nuxt.callHook('pages:resolved', pages as never)
      await nuxt.close()
    })
    expect(messages.some(message => /no route rule or page requires a user: every page is public/.test(message))).toBe(warned)
  })

  it('refuses Auth in server mode', async () => {
    await expect(load({ modules: [mobile], authentication: { mode: 'server' } }))
      .rejects.toThrow(/runs in server mode, which needs a same-origin session cookie/)
  })
})
