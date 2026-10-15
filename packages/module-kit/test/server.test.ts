import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
    expect(await run()).toEqual(['/generated/module-kit/db/accounts.sqlite.ts'])
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
    expect(await run()).toEqual(['/generated/module-kit/db/accounts.sqlite.ts', '/generated/module-kit/db/posts.sqlite.ts'])
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

  it('registers a single extension file for multiple tables via an array "name"', async () => {
    const { nuxt, rootDir, run } = setup()
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    const extension = join(rootDir, 'server/db/registered.sqlite.ts')
    writeFileSync(extension, 'export const accounts = {}; export const posts = {}')
    registerDatabaseTable(nuxt, {
      name: 'posts',
      factory: 'definePostsTable',
      resolver: createResolver(import.meta.url),
      schema: dialect => `./fixtures/posts.${dialect}`,
    })
    extendDatabaseTable(nuxt, {
      name: ['accounts', 'posts'],
      resolver: createResolver(rootDir),
      file: () => 'server/db/registered.sqlite.ts',
    })
    expect(await run()).toEqual(['/generated/module-kit/db/accounts.sqlite.ts', '/generated/module-kit/db/posts.sqlite.ts'])
    const accountTemplate = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const postTemplate = vi.mocked(addTemplate).mock.calls[1]![0] as NuxtTemplate
    expect((accountTemplate.getContents as () => string)())
      .toContain(`import * as extra0 from ${JSON.stringify(extension)}`)
    expect((accountTemplate.getContents as () => string)()).toContain('extra0["accounts" as keyof typeof extra0]')
    expect((postTemplate.getContents as () => string)())
      .toContain(`import * as extra0 from ${JSON.stringify(extension)}`)
    expect((postTemplate.getContents as () => string)()).toContain('extra0["posts" as keyof typeof extra0]')
  })

  it('registers a single extension file against every table when "name" is omitted', async () => {
    const { nuxt, rootDir, run } = setup()
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    const extension = join(rootDir, 'server/db/registered.sqlite.ts')
    writeFileSync(extension, 'export const accounts = {}; export const posts = {}')
    registerDatabaseTable(nuxt, {
      name: 'posts',
      factory: 'definePostsTable',
      resolver: createResolver(import.meta.url),
      schema: dialect => `./fixtures/posts.${dialect}`,
    })
    extendDatabaseTable(nuxt, {
      resolver: createResolver(rootDir),
      file: () => 'server/db/registered.sqlite.ts',
    })
    expect(await run()).toEqual(['/generated/module-kit/db/accounts.sqlite.ts', '/generated/module-kit/db/posts.sqlite.ts'])
    const accountTemplate = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const postTemplate = vi.mocked(addTemplate).mock.calls[1]![0] as NuxtTemplate
    expect((accountTemplate.getContents as () => string)())
      .toContain(`import * as extra0 from ${JSON.stringify(extension)}`)
    expect((accountTemplate.getContents as () => string)()).toContain('extra0["accounts" as keyof typeof extra0]')
    expect((postTemplate.getContents as () => string)())
      .toContain(`import * as extra0 from ${JSON.stringify(extension)}`)
    expect((postTemplate.getContents as () => string)()).toContain('extra0["posts" as keyof typeof extra0]')
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
    expect(await run()).toEqual(['/generated/module-kit/db/accounts.sqlite.ts'])
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

  it('throws when the schema file is missing for the current dialect', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'database-table-dialect-'))
    roots.push(rootDir)
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    writeFileSync(join(rootDir, 'server/db/schema.sqlite.ts'), 'export const accounts = sqliteTable(\'accounts\', {})')
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
      await nuxt.callHook('hub:db:schema:extend', { dialect: 'postgresql', paths })
    }).rejects.toThrow(/No postgresql schema at "server\/db\/schema\.postgresql"/)
  })

  it('registers multiple tables from the same schema file into a single file, resolving cross-table references', async () => {
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
      name: ['users', 'userPasskeys'],
      resolver: createResolver(import.meta.url),
      schema: dialect => `./fixtures/regular/multi.${dialect}`,
    })

    const paths: string[] = []
    await nuxt.callHook('hub:db:schema:extend', { dialect: 'sqlite', paths })
    expect(paths).toEqual(['/generated/module-kit/db/users-user-passkeys.sqlite.ts'])

    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const content = (template.getContents as () => string)()
    expect(content).toContain('export const users = sqliteTable("users", {')
    expect(content).toContain('export const userPasskeys = sqliteTable("user_passkeys", {')
    expect(content).toContain('userId: integer().notNull().references(() => users.id, { onDelete: \'cascade\' }),')
    expect(content).toContain('index(\'user_passkey_user_idx\').on(t.userId)')
  })

  it('auto-discovers every table export when "name" is omitted', async () => {
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
      resolver: createResolver(import.meta.url),
      schema: dialect => `./fixtures/regular/multi.${dialect}`,
    })

    const paths: string[] = []
    await nuxt.callHook('hub:db:schema:extend', { dialect: 'sqlite', paths })
    expect(paths).toEqual(['/generated/module-kit/db/users-user-passkeys.sqlite.ts'])

    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    const content = (template.getContents as () => string)()
    expect(content).toContain('export const users = sqliteTable("users", {')
    expect(content).toContain('export const userPasskeys = sqliteTable("user_passkeys", {')
  })

  it('throws when combining an array of names with a factory', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'database-table-regular-'))
    roots.push(rootDir)
    const nuxt = { options: { rootDir, _layers: [{ config: { rootDir } }] }, hook: vi.fn(), callHook: vi.fn() } as unknown as Nuxt

    expect(() => registerDatabaseTable(nuxt, {
      name: ['users', 'userPasskeys'],
      factory: 'defineUsersTable',
      resolver: createResolver(import.meta.url),
      schema: dialect => `./fixtures/regular/multi.${dialect}`,
    })).toThrow(/requires a single "name".*when "factory" is set/)
  })

  it('throws when omitting "name" together with a factory', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'database-table-regular-'))
    roots.push(rootDir)
    const nuxt = { options: { rootDir, _layers: [{ config: { rootDir } }] }, hook: vi.fn(), callHook: vi.fn() } as unknown as Nuxt

    expect(() => registerDatabaseTable(nuxt, {
      factory: 'defineUsersTable',
      resolver: createResolver(import.meta.url),
      schema: dialect => `./fixtures/regular/multi.${dialect}`,
    })).toThrow(/requires a single "name".*when "factory" is set/)
  })
})

function setupHooks() {
  const rootDir = mkdtempSync(join(tmpdir(), 'database-table-new-'))
  roots.push(rootDir)
  mkdirSync(join(rootDir, 'server/db'), { recursive: true })
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
  const write = (file: string, content: string) => writeFileSync(join(rootDir, 'server/db', file), content)
  const run = async (dialect = 'sqlite') => {
    const paths: string[] = []
    await nuxt.callHook('hub:db:schema:extend', { dialect, paths })
    return paths
  }
  const contents = (index = 0) => ((vi.mocked(addTemplate).mock.calls[index]![0] as NuxtTemplate).getContents as () => string)()
  return { nuxt, hooks, rootDir, write, run, contents, resolver: createResolver(rootDir) }
}

describe('registerDatabaseTable / extendDatabaseTable (synchronous registration)', () => {
  it('returns undefined and registers its hooks before any await', () => {
    const { nuxt, hooks, resolver } = setupHooks()
    const registered = registerDatabaseTable(nuxt, { resolver, schema: dialect => `server/db/schema.${dialect}` })
    expect(registered).toBeUndefined()
    expect(hooks.get('hub:db:schema:extend')).toHaveLength(1)

    const extended = extendDatabaseTable(nuxt, { resolver, file: dialect => `server/db/extra.${dialect}.ts` })
    expect(extended).toBeUndefined()
    expect(hooks.get('module-kit:db:table:extend')).toHaveLength(1)
  })

  it('extends only the table that has a matching export when "name" is omitted', async () => {
    const { nuxt, write, run, contents, resolver } = setupHooks()
    registerDatabaseTable(nuxt, { resolver: createResolver(import.meta.url), schema: () => './fixtures/regular/multi.sqlite' })
    write('shared.sqlite.ts', `
import { text } from 'drizzle-orm/sqlite-core'
export const users = { nickname: text() }
export const unrelated = { shouldNotAppear: text() }
`)
    extendDatabaseTable(nuxt, { resolver, file: dialect => `server/db/shared.${dialect}.ts` })
    expect(await run()).toEqual(['/generated/module-kit/db/users-user-passkeys.sqlite.ts'])

    const content = contents()
    expect(content).toContain('nickname: text(),')
    expect(content).not.toContain('shouldNotAppear')
    // The other table of the same schema is untouched.
    const passkeys = content.slice(content.indexOf('export const userPasskeys'))
    expect(passkeys).not.toContain('nickname')
    expect(passkeys).toContain('userId: integer()')
  })

  it('skips an extension file that does not exist for the dialect', async () => {
    const { nuxt, run, contents, resolver } = setupHooks()
    registerDatabaseTable(nuxt, { resolver: createResolver(import.meta.url), schema: () => './fixtures/regular/schema.sqlite' })
    extendDatabaseTable(nuxt, { resolver, file: dialect => `server/db/missing.${dialect}.ts` })
    await run()
    expect(contents()).toContain('export const accounts = sqliteTable("accounts", {')
  })
})

describe('registerDatabaseTable (schema validation)', () => {
  it('throws naming the dialect, the expected file and the override option when the dialect file is missing', async () => {
    const { nuxt, run, resolver } = setupHooks()
    registerDatabaseTable(nuxt, { resolver, schema: dialect => `server/db/schema.${dialect}` })
    await expect(run('sqlite')).rejects.toThrow(/No sqlite schema at "server\/db\/schema\.sqlite".*`override`/s)
  })

  it('ignores exported non-table objects when discovering tables', async () => {
    const { nuxt, write, run, contents, resolver } = setupHooks()
    write('schema.sqlite.ts', `
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const things = sqliteTable('things', { id: text().primaryKey() })
export const defaults = { id: text() }
`)
    registerDatabaseTable(nuxt, { resolver, schema: dialect => `server/db/schema.${dialect}` })
    expect(await run()).toEqual(['/generated/module-kit/db/things.sqlite.ts'])
    expect(contents()).toContain('export const things = sqliteTable("things", {')
    expect(contents()).not.toContain('export const defaults')
  })

  it('errors when an explicit name points at an export that is not a table call', async () => {
    const { nuxt, write, run, resolver } = setupHooks()
    write('schema.sqlite.ts', `
import { text } from 'drizzle-orm/sqlite-core'
export const defaults = { id: text() }
`)
    registerDatabaseTable(nuxt, { name: 'defaults', resolver, schema: dialect => `server/db/schema.${dialect}` })
    await expect(run()).rejects.toThrow(/"defaults".*exists but is not a table call/)
  })
})

describe('registerDatabaseTable (merging diagnostics)', () => {
  it('warns once when an extension file drops a table-config argument, and keeps the base indexes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { nuxt, write, run, contents } = setupHooks()
    registerDatabaseTable(nuxt, { resolver: createResolver(import.meta.url), schema: () => './fixtures/regular/multi.sqlite' })
    write('extend.sqlite.ts', `
import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
export const userPasskeys = sqliteTable('user_passkeys', {
  label: text(),
}, t => [index('extension_label_idx').on(t.label)])
`)
    await run()
    await run()
    const messages = warn.mock.calls.map(call => String(call[0])).filter(text => text.includes('table-config argument'))
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('userPasskeys')
    const content = contents(0)
    expect(content).toContain('label: text(),')
    expect(content).toContain('index(\'user_passkey_user_idx\').on(t.userId)')
    expect(content).not.toContain('extension_label_idx')
    warn.mockRestore()
  })

  it('warns when the extension declares a different SQL table name than the base', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { nuxt, write, run, contents } = setupHooks()
    registerDatabaseTable(nuxt, { resolver: createResolver(import.meta.url), schema: () => './fixtures/regular/schema.sqlite' })
    write('extend.sqlite.ts', `
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const accounts = sqliteTable('people', { nickname: text() })
`)
    await run()
    expect(warn.mock.calls.some(call => /declares the SQL table "people" but the base schema declares "accounts"/.test(String(call[0])))).toBe(true)
    expect(contents()).toContain('export const accounts = sqliteTable("accounts", {')
    warn.mockRestore()
  })

  it('rewrites relative imports of the schema file to absolute paths and keeps type-only specifiers', async () => {
    const { nuxt, run, contents } = setupHooks()
    registerDatabaseTable(nuxt, { resolver: createResolver(import.meta.url), schema: () => './fixtures/regular/relative.sqlite' })
    await run()
    const types = fileURLToPath(new URL('./fixtures/regular/types', import.meta.url))
    expect(contents()).toContain(`import { type Foo } from ${JSON.stringify(types)}`)
  })

  it('de-duplicates `X` and `type X` imports of the same module, preferring the value import', async () => {
    const { nuxt, write, run, contents, resolver } = setupHooks()
    write('schema.sqlite.ts', `
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Value } from 'pkg'
import type { Mode, Other } from 'pkg'
export const things = sqliteTable('things', { id: text().primaryKey().$type<Mode>() })
`)
    write('extend.sqlite.ts', `
import { text } from 'drizzle-orm/sqlite-core'
import { Mode, type Other } from 'pkg'
import type { Value } from 'pkg'
export const things = { extra: text().$type<Mode | Other | Value>() }
`)
    registerDatabaseTable(nuxt, { resolver, schema: dialect => `server/db/schema.${dialect}` })
    await run()
    expect(contents()).toContain('import { Value, Mode, type Other } from "pkg"')
  })

  it('honours a legacy per-table default export in regular mode', async () => {
    const { nuxt, write, run, contents, resolver } = setupHooks()
    write('schema.sqlite.ts', `
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const things = sqliteTable('things', { id: text().primaryKey() })
`)
    write('things.extend.sqlite.ts', `
import { text } from 'drizzle-orm/sqlite-core'
export default { legacyColumn: text() }
`)
    registerDatabaseTable(nuxt, { resolver, schema: dialect => `server/db/schema.${dialect}` })
    await run()
    expect(contents()).toContain('legacyColumn: text(),')
  })

  it('warns when a legacy per-table file has neither a named nor a default export that parses', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { nuxt, write, run, contents, resolver } = setupHooks()
    write('schema.sqlite.ts', `
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const things = sqliteTable('things', { id: text().primaryKey() })
`)
    write('things.extend.sqlite.ts', 'export const unrelated = 1')
    registerDatabaseTable(nuxt, { resolver, schema: dialect => `server/db/schema.${dialect}` })
    await run()
    expect(warn.mock.calls.some(call => /legacy `things\.extend\.sqlite` file/.test(String(call[0])))).toBe(true)
    expect(contents()).not.toContain('unrelated')
    warn.mockRestore()
  })

  it('appends a short hash to the generated file name when the table names are long', async () => {
    const { nuxt, write, run, resolver } = setupHooks()
    const names = Array.from({ length: 8 }, (_, index) => `someVeryLongTableName${index}`)
    write('schema.sqlite.ts', `import { sqliteTable, text } from 'drizzle-orm/sqlite-core'\n${names.map(name => `export const ${name} = sqliteTable('${name}', { id: text().primaryKey() })`).join('\n')}\n`)
    registerDatabaseTable(nuxt, { resolver, schema: dialect => `server/db/schema.${dialect}` })
    const [path] = await run()
    expect(path).toMatch(/^\/generated\/module-kit\/db\/[a-z0-9-]{1,69}-[0-9a-f]{8}\.sqlite\.ts$/)
  })
})

describe('registerDatabaseTable (deprecated factory)', () => {
  it('logs the deprecation warning once across registrations', async () => {
    vi.resetModules()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fresh = await import('../src/runtime/utils/server')
    const { nuxt, resolver } = setupHooks()
    for (let index = 0; index < 2; index++) {
      fresh.registerDatabaseTable(nuxt, { name: 'accounts', factory: 'defineAccountsTable', resolver, schema: dialect => `./fixtures/schema.${dialect}` })
    }
    const deprecations = warn.mock.calls.filter(call => /`factory` \/ `defineExtendableTable` are deprecated/.test(String(call[0])))
    expect(deprecations).toHaveLength(1)
    warn.mockRestore()
  })
})
