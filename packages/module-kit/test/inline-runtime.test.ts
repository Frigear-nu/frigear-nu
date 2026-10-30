import { describe, expect, it } from 'vitest'
import { createResolver } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'
import type { NitroConfig } from 'nitropack/types'
import { inlineModuleRuntime } from '../src/runtime/utils/server'

const store = '/app/node_modules/.pnpm'
const notify = `${store}/@frigear-nu+notify@1.0.0/node_modules/@frigear-nu/notify/dist`
const users = `${store}/@frigear-nu+users@1.0.0/node_modules/@frigear-nu/users/dist`

/** Runs `inlineModuleRuntime` for each module dir, then the `nitro:config` hooks on `config`, as Nuxt does. */
function setup(moduleDirs: string[], config: NitroConfig) {
  const hooks: Array<(config: NitroConfig) => void> = []
  const nuxt = {
    options: { build: { transpile: [] } },
    hook: (name: string, fn: (config: NitroConfig) => void) => {
      if (name === 'nitro:config') hooks.push(fn)
    },
  } as unknown as Nuxt
  for (const dir of moduleDirs) inlineModuleRuntime(nuxt, createResolver(`file://${dir}/module.mjs`))
  for (const hook of hooks) hook(config)
  return { nuxt, config }
}
const nitroConfigFor = (moduleDirs: string[], config: NitroConfig) => setup(moduleDirs, config).config

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

  it('leaves disabled auto-imports alone', () => {
    expect(nitroConfigFor([notify], { imports: false }).imports).toBe(false)
  })
})
