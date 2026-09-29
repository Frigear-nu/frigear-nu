import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { addTemplate, createResolver } from '@nuxt/kit'
import type { Nuxt, NuxtTemplate } from '@nuxt/schema'
import { extendDatabaseTable } from '../src/runtime/utils/server'

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

function setup(override?: string, extensionFile?: (dialect: string) => string) {
  const rootDir = mkdtempSync(join(tmpdir(), 'database-table-'))
  roots.push(rootDir)
  let hook: (props: { dialect: string, paths: string[] }) => Promise<void>
  const nuxt = {
    options: { rootDir },
    hook: (_name: string, callback: typeof hook) => { hook = callback },
  } as unknown as Nuxt

  extendDatabaseTable(nuxt, {
    name: 'accounts',
    factory: 'defineAccountsTable',
    resolver: createResolver(import.meta.url),
    schema: dialect => `./fixtures/schema.${dialect}`,
    override,
    extensionFile,
  })
  return { rootDir, run: async () => {
    const paths: string[] = []
    await hook({ dialect: 'sqlite', paths })
    return paths
  } }
}

describe('extendDatabaseTable', () => {
  it('generates a schema from the module factory without an extension file', async () => {
    const { run } = setup()
    expect(await run()).toEqual(['/generated/#accounts/schema.sqlite.ts'])
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    expect(template.write).toBe(true)
    expect((template.getContents as () => string)()).toContain('const extra = {}')
    expect((template.getContents as () => string)()).toContain('export const accounts = defineAccountsTable(extra)')
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
      .toContain(`import extra from ${JSON.stringify(extension)}`)
  })

  it('accepts a custom extension file path', async () => {
    const { rootDir, run } = setup(undefined, dialect => `server/db/custom.${dialect}.ts`)
    const extension = join(rootDir, 'server/db/custom.sqlite.ts')
    mkdirSync(join(rootDir, 'server/db'), { recursive: true })
    writeFileSync(extension, 'export default {}')
    await run()
    const template = vi.mocked(addTemplate).mock.calls[0]![0] as NuxtTemplate
    expect((template.getContents as () => string)())
      .toContain(`import extra from ${JSON.stringify(extension)}`)
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
