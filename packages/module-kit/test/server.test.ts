import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addTemplate, createResolver } from '@nuxt/kit'
import type { Nuxt, NuxtTemplate } from '@nuxt/schema'
import { extendDatabaseTable, registerDatabaseTableExtension } from '../src/runtime/utils/server'

vi.mock('@nuxt/kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nuxt/kit')>()
  return {
    ...actual,
    addTemplate: vi.fn(({ filename }: { filename: string }) => ({ dst: `/generated/${filename}` })),
  }
})

const roots: string[] = []

afterEach(() => {
  vi.clearAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function setup(override?: string, extensionFile?: (dialect: string) => string, layers: string[] = []) {
  const rootDir = mkdtempSync(join(tmpdir(), 'database-table-'))
  roots.push(rootDir)
  const hooks = new Map<string, Array<(props: never) => Promise<void>>>()
  const nuxt = {
    options: { rootDir, _layers: [{ config: { rootDir } }, ...layers.map(rootDir => ({ config: { rootDir } }))] },
    hook: (name: string, callback: (props: never) => Promise<void>) => {
      hooks.set(name, [...(hooks.get(name) ?? []), callback])
    },
    callHook: async (name: string, props: never) => {
      for (const callback of hooks.get(name) ?? []) await callback(props)
    },
  } as unknown as Nuxt

  extendDatabaseTable(nuxt, {
    name: 'accounts',
    factory: 'defineAccountsTable',
    resolver: createResolver(import.meta.url),
    schema: dialect => `./fixtures/schema.${dialect}`,
    override,
    extensionFile,
  })
  return { nuxt, rootDir, run: async () => {
    const paths: string[] = []
    await nuxt.callHook('hub:db:schema:extend', { dialect: 'sqlite', paths })
    return paths
  } }
}

describe('extendDatabaseTable', () => {
  it('generates a schema from the module factory without an extension file', async () => {
    const { run } = setup()
    expect(await run()).toEqual(['/generated/#accounts/schema.sqlite.ts'])
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    expect(template.write).toBe(true)
    expect((template.getContents as () => string)()).toContain('export const accounts = defineAccountsTable({  })')
    expect((template.getContents as () => string)()).toContain('fixtures/schema.sqlite')
  })

  it('imports an application extension file when present', async () => {
    const { rootDir, run } = setup()
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    const extension = join(rootDir, 'server/db/accounts.extend.sqlite.ts')
    writeFileSync(extension, 'export default {}')
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    expect((template.getContents as () => string)())
      .toContain(`import extra0 from ${JSON.stringify(extension)}`)
  })

  it('accepts a custom extension file path', async () => {
    const { rootDir, run } = setup(undefined, dialect => `server/db/custom.${dialect}.ts`)
    const extension = join(rootDir, 'server/db/custom.sqlite.ts')
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    writeFileSync(extension, 'export default {}')
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    expect((template.getContents as () => string)())
      .toContain(`import extra0 from ${JSON.stringify(extension)}`)
  })

  it('merges registered modules and layers in order, with the host last', async () => {
    const base = mkdtempSync(join(tmpdir(), 'database-layer-'))
    const nested = mkdtempSync(join(tmpdir(), 'database-layer-'))
    roots.push(base, nested)
    const { nuxt, rootDir, run } = setup(undefined, undefined, [nested, base])
    for (const dir of [base, nested, rootDir]) {
      mkdirSync(join(dir, 'server/db'), { recursive: true })
      writeFileSync(join(dir, 'server/db/accounts.extend.sqlite.ts'), 'export default {}')
    }
    writeFileSync(join(rootDir, 'server/db/first.sqlite.ts'), 'export default {}')
    writeFileSync(join(rootDir, 'server/db/second.sqlite.ts'), 'export default {}')
    registerDatabaseTableExtension(nuxt, {
      name: 'accounts',
      resolver: createResolver(rootDir),
      file: dialect => `server/db/first.${dialect}.ts`,
    })
    registerDatabaseTableExtension(nuxt, {
      name: 'other',
      resolver: createResolver(rootDir),
      file: dialect => `server/db/ignored.${dialect}.ts`,
    })
    registerDatabaseTableExtension(nuxt, {
      name: 'accounts',
      resolver: createResolver(rootDir),
      file: dialect => `server/db/second.${dialect}.ts`,
    })
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const content = (template.getContents as () => string)()
    expect(content).toContain('export const accounts = defineAccountsTable({ ...extra0, ...extra1, ...extra2, ...extra3, ...extra4 })')
    expect(content).not.toContain('ignored.sqlite')
    expect(content.indexOf('first.sqlite')).toBeLessThan(content.indexOf('second.sqlite'))
    expect(content.indexOf('second.sqlite')).toBeLessThan(content.indexOf(JSON.stringify(join(base, 'server/db/accounts.extend.sqlite.ts'))))
    expect(content.indexOf(JSON.stringify(join(base, 'server/db/accounts.extend.sqlite.ts')))).toBeLessThan(content.indexOf(JSON.stringify(join(nested, 'server/db/accounts.extend.sqlite.ts'))))
    expect(content.indexOf(JSON.stringify(join(nested, 'server/db/accounts.extend.sqlite.ts')))).toBeLessThan(content.indexOf(JSON.stringify(join(rootDir, 'server/db/accounts.extend.sqlite.ts'))))
  })

  it('skips registered files that are unavailable for the dialect', async () => {
    const { nuxt, rootDir, run } = setup()
    registerDatabaseTableExtension(nuxt, {
      name: 'accounts',
      resolver: createResolver(rootDir),
      file: dialect => `server/db/missing.${dialect}.ts`,
    })
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    expect((template.getContents as () => string)()).not.toContain('missing.sqlite')
  })

  it('uses an override without generating a template', async () => {
    const { rootDir, run } = setup('server/db/custom.sqlite.ts')
    const override = join(rootDir, 'server/db/custom.sqlite.ts')
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    writeFileSync(override, 'export const accounts = {}')
    expect(await run()).toEqual([override])
    expect(addTemplate).not.toHaveBeenCalled()
  })
})
