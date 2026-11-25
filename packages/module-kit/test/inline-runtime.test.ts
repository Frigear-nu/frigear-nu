import { describe, expect, it, vi } from 'vitest'
import { createResolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import type { NitroConfig } from 'nitropack/types'
import { inlineModuleRuntime } from '../src/runtime/utils/server'

const store = '/app/node_modules/.pnpm'
const notify = `${store}/@frigear-nu+notify@1.0.0/node_modules/@frigear-nu/notify/dist`
const users = `${store}/@frigear-nu+users@1.0.0/node_modules/@frigear-nu/users/dist`

type InlineModuleRuntime = typeof inlineModuleRuntime
const oauthServer = `${store}/@frigear-nu+oauth-server@1.0.0/node_modules/@frigear-nu/oauth-server/dist`

/**
 * Runs `inlineModuleRuntime` for each module dir, then the `nitro:config` hooks on `config`, as Nuxt does. A module
 * given as `[dir, inline]` uses its own copy of `inlineModuleRuntime`, as when an app installs module-kit twice.
 */
function setup(modules: Array<string | [string, InlineModuleRuntime]>, config: NitroConfig) {
  const hooks: Array<(config: NitroConfig) => void> = []
  const nuxt = {
    options: { build: { transpile: [] } },
    hook: (name: string, fn: (config: NitroConfig) => void) => {
      if (name === 'nitro:config') hooks.push(fn)
    },
  } as unknown as Nuxt
  for (const module of modules) {
    const [dir, inline] = typeof module === 'string' ? [module, inlineModuleRuntime] : module
    inline(nuxt, createResolver(`file://${dir}/module.mjs`))
  }
  for (const hook of hooks) hook(config)
  return { nuxt, config }
}

/** A second, independent copy of module-kit's `inlineModuleRuntime`. */
async function anotherCopy(): Promise<InlineModuleRuntime> {
  vi.resetModules()
  const copy = (await import('../src/runtime/utils/server')).inlineModuleRuntime
  expect(copy).not.toBe(inlineModuleRuntime)
  return copy
}

/** `inlineModuleRuntime` as module-kit 1.3.0 and earlier shipped it, tracking its wraps in a module-scope `WeakMap`. */
function legacyCopy(): InlineModuleRuntime {
  const escapeRE = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const runtimeExcludes = new WeakMap<RegExp, string[]>()
  return (nuxt, resolver) => {
    const runtime = resolver.resolve('./runtime')
    nuxt.hook('nitro:config', (config) => {
      if (!config.imports) return
      config.imports.exclude = [config.imports.exclude ?? []].flat().map((pattern) => {
        if (!(pattern instanceof RegExp)) return pattern
        const runtimes = runtimeExcludes.get(pattern)
        if (runtimes?.includes(runtime) || (!runtimes && !pattern.source.startsWith('node_modules'))) return pattern
        const wrapped = new RegExp(`^(?!${escapeRE(runtime)}/)[\\s\\S]*?(?:${pattern.source})`, pattern.flags)
        runtimeExcludes.set(wrapped, [...runtimes ?? [], runtime])
        return wrapped
      })
    })
  }
}
const nitroConfigFor = (modules: Parameters<typeof setup>[0], config: NitroConfig) => setup(modules, config).config

// What Nuxt sets: everything in `node_modules` except its layers (here `some-layer`) and `.git`.
const nuxtImports = () => ({ exclude: [/node_modules\/(?!some-layer)/, /[\\/]\.git[\\/]/] })

const excluded = (config: NitroConfig, id: string) =>
  [config.imports && config.imports.exclude].flat().some(pattern => pattern instanceof RegExp && pattern.test(id))

describe('inlineModuleRuntime', () => {
  it('inlines the runtime for Nitro and the app build', () => {
    const config = nitroConfigFor([notify], { imports: nuxtImports() })
    expect(config.externals?.inline).toEqual([`${notify}/runtime`])
  })

  it('transpiles the runtime on the app side', () => {
    const { nuxt } = setup([notify], { imports: nuxtImports() })
    expect(nuxt.options.build.transpile).toEqual([`${notify}/runtime`])
  })

  it('keeps the module runtime in Nitro auto-imports, and nothing else from node_modules', () => {
    const config = nitroConfigFor([notify, users], { imports: nuxtImports() })

    expect(excluded(config, `${notify}/runtime/server/utils/dispatch.js`)).toBe(false)
    expect(excluded(config, `${users}/runtime/server/utils/user-store.js`)).toBe(false)
    expect(excluded(config, '/app/node_modules/some-layer/server/utils/a.ts')).toBe(false)
    expect(excluded(config, '/app/server/api/a.ts')).toBe(false)

    expect(excluded(config, `${notify}/module.mjs`)).toBe(true)
    expect(excluded(config, `${notify}/runtime-other/a.js`)).toBe(true)
    expect(excluded(config, `${store}/h3@1.0.0/node_modules/h3/dist/index.mjs`)).toBe(true)
    expect(excluded(config, '/app/.git/a.ts')).toBe(true)
  })

  it('carves each runtime out only once', () => {
    const config = nitroConfigFor([notify, notify], { imports: nuxtImports() })
    const [pattern] = [config.imports && config.imports.exclude].flat()
    expect(String(pattern).split('(?!').length).toBe(3)
  })

  describe('with several copies of module-kit', () => {
    const expectCarvedOut = (config: NitroConfig, runtimes: string[]) => {
      for (const dir of runtimes) {
        expect(excluded(config, `${dir}/runtime/server/routes/a.get.js`)).toBe(false)
        expect(excluded(config, `${dir}/module.mjs`)).toBe(true)
      }
      expect(excluded(config, '/app/node_modules/some-layer/server/utils/a.ts')).toBe(false)
      expect(excluded(config, `${store}/h3@1.0.0/node_modules/h3/dist/index.mjs`)).toBe(true)
      expect(excluded(config, '/app/.git/a.ts')).toBe(true)
    }

    it('carves out the runtimes of modules on either copy', async () => {
      const copy = await anotherCopy()
      const config = nitroConfigFor([notify, users, [oauthServer, copy]], { imports: nuxtImports() })
      expectCarvedOut(config, [notify, users, oauthServer])
    })

    it('carves each runtime out only once, whichever copy saw it first', async () => {
      const copy = await anotherCopy()
      const config = nitroConfigFor([notify, [notify, copy], [users, copy], users], { imports: nuxtImports() })
      const [pattern] = [config.imports && config.imports.exclude].flat()
      expect(String(pattern).split('(?!').length).toBe(4)
      expectCarvedOut(config, [notify, users])
    })

    it('builds on patterns a copy from before 1.3.1 wrapped first', () => {
      const legacy = legacyCopy()
      const config = nitroConfigFor([[notify, legacy], [users, legacy], oauthServer], { imports: nuxtImports() })
      expectCarvedOut(config, [notify, users, oauthServer])
    })
  })

  it('leaves disabled auto-imports alone', () => {
    expect(nitroConfigFor([notify], { imports: false }).imports).toBe(false)
  })
})
