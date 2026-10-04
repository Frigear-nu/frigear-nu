import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addTemplate, createResolver } from '@nuxt/kit'
import type { Nuxt, NuxtTemplate } from '@nuxt/schema'
import { registerDatabaseTable, extendDatabaseTable } from '../src/runtime/utils/server'

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

  registerDatabaseTable(nuxt, {
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

describe('registerDatabaseTable', () => {
  it('generates a schema from the module factory without an extension file', async () => {
    const { run } = setup()
    expect(await run()).toEqual(['/generated/accounts/schema.sqlite.ts'])
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    expect(template.write).toBe(true)
    expect((template.getContents as () => string)()).toContain('export const accounts = defineAccountsTable({ name: "accounts", columns: {  } })')
    expect((template.getContents as () => string)()).toContain('fixtures/schema.sqlite')
  })

  it('imports an application extension file when present', async () => {
    const { rootDir, run } = setup()
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    const extension = join(rootDir, 'server/db/extend.sqlite.ts')
    writeFileSync(extension, 'export const accounts = {}')
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    expect((template.getContents as () => string)())
      .toContain(`import * as extra0 from ${JSON.stringify(extension)}`)
    expect((template.getContents as () => string)())
      .toContain('extra0["accounts" as keyof typeof extra0]')
  })

  it('selects each table from the same named-export extension file', async () => {
    const { nuxt, rootDir, run } = setup()
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    const extension = join(rootDir, 'server/db/extend.sqlite.ts')
    writeFileSync(extension, 'export const accounts = {}; export const posts = {}')
    registerDatabaseTable(nuxt, {
      name: 'posts',
      factory: 'definePostsTable',
      resolver: createResolver(import.meta.url),
      schema: dialect => `./fixtures/posts.${dialect}`,
    })
    expect(await run()).toEqual(['/generated/accounts/schema.sqlite.ts', '/generated/posts/schema.sqlite.ts'])
    const accountTemplate = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const postTemplate = vi.mocked(addTemplate).mock.calls[1]![0] as NuxtTemplate
    expect((accountTemplate.getContents as () => string)()).toContain('extra0["accounts" as keyof typeof extra0]')
    expect((postTemplate.getContents as () => string)()).toContain('extra0["posts" as keyof typeof extra0]')
    expect((postTemplate.getContents as () => string)()).toContain(`import * as extra0 from ${JSON.stringify(extension)}`)
  })

  it('accepts a custom extension file path', async () => {
    const { rootDir, run } = setup(undefined, dialect => `server/db/custom.${dialect}.ts`)
    const extension = join(rootDir, 'server/db/custom.sqlite.ts')
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    writeFileSync(extension, 'export const accounts = {}')
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    expect((template.getContents as () => string)())
      .toContain(`import * as extra0 from ${JSON.stringify(extension)}`)
  })

  it('supports legacy per-table default exports when no shared extension exists', async () => {
    const { rootDir, run } = setup()
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    const extension = join(rootDir, 'server/db/accounts.extend.sqlite.ts')
    writeFileSync(extension, 'export default {}')
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const content = (template.getContents as () => string)()
    expect(content).toContain(`import * as extra0 from ${JSON.stringify(extension)}`)
    expect(content).toContain('Object.entries(extra0).find(([key]) => key === \'default\')')
  })

  it('keeps a legacy table extension alongside a shared extension for another table', async () => {
    const { rootDir, run } = setup()
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    const legacy = join(rootDir, 'server/db/accounts.extend.sqlite.ts')
    const shared = join(rootDir, 'server/db/extend.sqlite.ts')
    writeFileSync(legacy, 'export default {}')
    writeFileSync(shared, 'export const posts = {}')
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const content = (template.getContents as () => string)()
    expect(content).toContain(`import * as extra0 from ${JSON.stringify(legacy)}`)
    expect(content).toContain(`import * as extra1 from ${JSON.stringify(shared)}`)
  })

  it('supports registered default exports as well as named table exports', async () => {
    const { nuxt, rootDir, run } = setup()
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    const extension = join(rootDir, 'server/db/registered.sqlite.ts')
    writeFileSync(extension, 'export default {}')
    extendDatabaseTable(nuxt, {
      name: 'accounts',
      resolver: createResolver(rootDir),
      file: () => 'server/db/registered.sqlite.ts',
    })
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const content = (template.getContents as () => string)()
    expect(content).toContain(`import * as extra0 from ${JSON.stringify(extension)}`)
    expect(content).toContain('Object.entries(extra0).find(([key]) => key === \'default\')')
  })

  it('merges registered modules and layers in order, with the host last', async () => {
    const base = mkdtempSync(join(tmpdir(), 'database-layer-'))
    const nested = mkdtempSync(join(tmpdir(), 'database-layer-'))
    roots.push(base, nested)
    const { nuxt, rootDir, run } = setup(undefined, undefined, [nested, base])
    for (const dir of [base, nested, rootDir]) {
      mkdirSync(join(dir, 'server/db'), { recursive: true })
      writeFileSync(join(dir, 'server/db/extend.sqlite.ts'), 'export const accounts = {}; export const other = {}')
    }
    writeFileSync(join(rootDir, 'server/db/first.sqlite.ts'), 'export const accounts = {}')
    writeFileSync(join(rootDir, 'server/db/second.sqlite.ts'), 'export const accounts = {}')
    extendDatabaseTable(nuxt, {
      name: 'accounts',
      resolver: createResolver(rootDir),
      file: dialect => `server/db/first.${dialect}.ts`,
    })
    extendDatabaseTable(nuxt, {
      name: 'other',
      resolver: createResolver(rootDir),
      file: dialect => `server/db/ignored.${dialect}.ts`,
    })
    extendDatabaseTable(nuxt, {
      name: 'accounts',
      resolver: createResolver(rootDir),
      file: dialect => `server/db/second.${dialect}.ts`,
    })
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const content = (template.getContents as () => string)()
    expect(content).toContain('export const accounts = defineAccountsTable({ name: "accounts", columns: { ...(extra0["accounts" as keyof typeof extra0]')
    expect(content).toContain('...(extra4["accounts" as keyof typeof extra4]')
    expect(content).not.toContain('ignored.sqlite')
    expect(content.indexOf('first.sqlite')).toBeLessThan(content.indexOf('second.sqlite'))
    expect(content.indexOf('second.sqlite')).toBeLessThan(content.indexOf(JSON.stringify(join(base, 'server/db/extend.sqlite.ts'))))
    expect(content.indexOf(JSON.stringify(join(base, 'server/db/extend.sqlite.ts')))).toBeLessThan(content.indexOf(JSON.stringify(join(nested, 'server/db/extend.sqlite.ts'))))
    expect(content.indexOf(JSON.stringify(join(nested, 'server/db/extend.sqlite.ts')))).toBeLessThan(content.indexOf(JSON.stringify(join(rootDir, 'server/db/extend.sqlite.ts'))))
  })

  it('skips registered files that are unavailable for the dialect', async () => {
    const { nuxt, rootDir, run } = setup()
    extendDatabaseTable(nuxt, {
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

function setupRegular() {
  const rootDir = mkdtempSync(join(tmpdir(), 'database-table-regular-'))
  roots.push(rootDir)
  const hooks = new Map<string, Array<(props: never) => Promise<void>>>()
  const nuxt = {
    options: { rootDir, _layers: [{ config: { rootDir } }] },
    hook: (name: string, callback: (props: never) => Promise<void>) => {
      hooks.set(name, [...(hooks.get(name) ?? []), callback])
    },
    callHook: async (name: string, props: never) => {
      for (const callback of hooks.get(name) ?? []) await callback(props)
    },
  } as unknown as Nuxt

  registerDatabaseTable(nuxt, {
    name: 'accounts',
    resolver: createResolver(import.meta.url),
    schema: dialect => `./fixtures/regular/schema.${dialect}`,
  })
  return { nuxt, rootDir, run: async () => {
    const paths: string[] = []
    await nuxt.callHook('hub:db:schema:extend', { dialect: 'sqlite', paths })
    return paths
  } }
}

describe('registerDatabaseTable (without a factory)', () => {
  it('generates a merged table directly from a regular drizzle schema file', async () => {
    const { run } = setupRegular()
    expect(await run()).toEqual(['/generated/accounts/schema.sqlite.ts'])
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const content = (template.getContents as () => string)()
    expect(content).toContain('import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"')
    expect(content).toContain('export const accounts = sqliteTable("accounts", {')
    expect(content).toContain('id: integer().primaryKey(),')
    expect(content).toContain('name: text().notNull(),')
  })

  it('merges a regular full-table extension file, overriding matching columns', async () => {
    const { rootDir, run } = setupRegular()
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    writeFileSync(join(rootDir, 'server/db/extend.sqlite.ts'), `
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const accounts = sqliteTable('accounts', {
  name: text(),
  email: text().notNull().unique(),
})
`)
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const content = (template.getContents as () => string)()
    expect(content).toContain('id: integer().primaryKey(),')
    expect(content).toContain('name: text(),')
    expect(content).not.toContain('name: text().notNull(),')
    expect(content).toContain('email: text().notNull().unique(),')
  })

  it('merges a plain columns object extension file without any table wrapper', async () => {
    const { rootDir, run } = setupRegular()
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    writeFileSync(join(rootDir, 'server/db/extend.sqlite.ts'), `
import { text } from 'drizzle-orm/sqlite-core'
export const accounts = { locale: text().default('da') }
`)
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const content = (template.getContents as () => string)()
    expect(content).toContain('id: integer().primaryKey(),')
    expect(content).toContain('name: text().notNull(),')
    expect(content).toContain('locale: text().default(\'da\'),')
  })

  it('throws a helpful error when the schema file has no matching table export', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'database-table-regular-'))
    roots.push(rootDir)
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    writeFileSync(join(rootDir, 'server/db/schema.sqlite.ts'), 'export const other = {}')
    const hooks = new Map<string, Array<(props: never) => Promise<void>>>()
    const nuxt = {
      options: { rootDir, _layers: [{ config: { rootDir } }] },
      hook: (name: string, callback: (props: never) => Promise<void>) => {
        hooks.set(name, [...(hooks.get(name) ?? []), callback])
      },
      callHook: async (name: string, props: never) => {
        for (const callback of hooks.get(name) ?? []) await callback(props)
      },
    } as unknown as Nuxt

    registerDatabaseTable(nuxt, {
      name: 'accounts',
      resolver: createResolver(rootDir),
      schema: dialect => `server/db/schema.${dialect}`,
    })

    await expect(async () => {
      const paths: string[] = []
      await nuxt.callHook('hub:db:schema:extend', { dialect: 'sqlite', paths })
    }).rejects.toThrow(/Could not find a table export named "accounts"/)
  })
})
