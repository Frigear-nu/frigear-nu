import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listRegularTableExportNames, parseRegularTableExport } from '../src/runtime/utils/regular-table'

const fixture = fileURLToPath(new URL('./fixtures/regular/schema.sqlite.ts', import.meta.url))

describe('parseRegularTableExport', () => {
  it('extracts the table call, columns and imports from a regular table export', () => {
    const result = parseRegularTableExport(fixture, 'accounts')
    expect(result).toBeDefined()
    expect(result!.tableCall).toEqual({ callee: 'sqliteTable', tableName: 'accounts' })
    expect([...result!.properties.keys()]).toEqual(['id', 'name'])
    expect(result!.properties.get('id')).toBe('id: integer().primaryKey()')
    expect(result!.imports.get('drizzle-orm/sqlite-core')).toEqual(new Set(['integer', 'sqliteTable', 'text']))
  })

  it('returns undefined when the export is not found', () => {
    expect(parseRegularTableExport(fixture, 'missing')).toBeUndefined()
  })

  it('captures a third table-config argument (e.g. index callbacks) as raw text', () => {
    const file = fileURLToPath(new URL('./fixtures/regular/multi.sqlite.ts', import.meta.url))
    const result = parseRegularTableExport(file, 'userPasskeys')
    expect(result!.tableCall!.callee).toBe('sqliteTable')
    expect(result!.tableCall!.tableName).toBe('user_passkeys')
    expect(result!.tableCall!.extraArgs).toHaveLength(1)
    expect(result!.tableCall!.extraArgs![0]).toContain('index(\'user_passkey_user_idx\').on(t.userId)')
  })

  it('unwraps a plain columns object export', () => {
    const file = fileURLToPath(new URL('./fixtures/regular/plain-object.sqlite.ts', import.meta.url))
    const result = parseRegularTableExport(file, 'accounts')
    expect(result!.tableCall).toBeUndefined()
    expect([...result!.properties.keys()]).toEqual(['locale'])
  })

  it('unwraps a single-argument wrapper call like defineTableColumns', () => {
    const file = fileURLToPath(new URL('./fixtures/regular/wrapped.sqlite.ts', import.meta.url))
    const result = parseRegularTableExport(file, 'accounts')
    expect(result!.tableCall).toBeUndefined()
    expect([...result!.properties.keys()]).toEqual(['summary'])
  })

  it('unwraps a default export', () => {
    const file = fileURLToPath(new URL('./fixtures/regular/default-export.sqlite.ts', import.meta.url))
    const result = parseRegularTableExport(file, 'default')
    expect([...result!.properties.keys()]).toEqual(['legacyColumn'])
  })
})

describe('listRegularTableExportNames', () => {
  it('lists every table-like named export in the file', () => {
    const file = fileURLToPath(new URL('./fixtures/regular/multi.sqlite.ts', import.meta.url))
    expect(listRegularTableExportNames(file)).toEqual(['users', 'userPasskeys'])
  })

  it('lists only exports initialised by a table call with `tablesOnly`', () => {
    const plain = fileURLToPath(new URL('./fixtures/regular/plain-object.sqlite.ts', import.meta.url))
    expect(listRegularTableExportNames(plain)).toEqual(['accounts'])
    expect(listRegularTableExportNames(plain, { tablesOnly: true })).toEqual([])

    const multi = fileURLToPath(new URL('./fixtures/regular/multi.sqlite.ts', import.meta.url))
    expect(listRegularTableExportNames(multi, { tablesOnly: true })).toEqual(['users', 'userPasskeys'])
  })

  it('does not include the default export', () => {
    const file = fileURLToPath(new URL('./fixtures/regular/default-export.sqlite.ts', import.meta.url))
    expect(listRegularTableExportNames(file)).toEqual([])
  })
})

describe('parseRegularTableExport (imports)', () => {
  it('rewrites relative specifiers to absolute paths and keeps `type` on type-only imports', () => {
    const file = fileURLToPath(new URL('./fixtures/regular/relative.sqlite.ts', import.meta.url))
    const types = fileURLToPath(new URL('./fixtures/regular/types', import.meta.url))
    const result = parseRegularTableExport(file, 'things')
    expect(result!.imports.get(types)).toEqual(new Set(['type Foo']))
    expect([...result!.imports.keys()].some(module => module.startsWith('.'))).toBe(false)
    expect(result!.imports.get('drizzle-orm/sqlite-core')).toEqual(new Set(['sqliteTable', 'text']))
  })
})

describe('parseRegularTableExport (postgresql)', () => {
  it('extracts a pgTable export the same way', () => {
    const file = fileURLToPath(new URL('./fixtures/regular/schema.postgresql.ts', import.meta.url))
    const result = parseRegularTableExport(file, 'accounts')
    expect(result!.tableCall).toEqual({ callee: 'pgTable', tableName: 'accounts' })
    expect([...result!.properties.keys()]).toEqual(['id', 'name'])
    expect(result!.imports.get('drizzle-orm/pg-core')).toEqual(new Set(['integer', 'pgTable', 'text']))
  })
})

describe('parseRegularTableExport (source shapes)', () => {
  let dir: string
  const write = (name: string, content: string) => {
    const file = join(dir, name)
    writeFileSync(file, content)
    return file
  }

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'regular-table-'))
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('keeps the raw text of every property kind and skips methods and accessors', () => {
    const file = write('shapes.sqlite.ts', `import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
const shared = { a: text() }
const computed = 'dynamic'
export const things = sqliteTable(\`things\`, {
  id: text().primaryKey(), // trailing comment
  /* leading comment */ 'quoted': text(),
  [computed]: text(),
  shared,
  ...shared,
  method() { return 1 },
  get accessor() { return 1 },
}, /* config */ t => [t.id])
`)
    const result = parseRegularTableExport(file, 'things')
    expect(result!.tableCall).toEqual({ callee: 'sqliteTable', tableName: 'things', extraArgs: ['t => [t.id]'] })
    expect([...result!.properties]).toEqual([
      ['id', 'id: text().primaryKey()'],
      ['\'quoted\'', '\'quoted\': text()'],
      ['[computed]', '[computed]: text()'],
      ['shared', 'shared'],
      ['__spread_4', '...shared'],
    ])
  })

  it('collects only named import bindings and keeps inline `type` modifiers as written', () => {
    const file = write('imports.sqlite.ts', `import def, { text as t, type Foo } from 'drizzle-orm/sqlite-core'
import * as ns from 'namespace'
import onlyDefault from 'default'
import 'side-effect'
import type { Bar, Baz as Qux } from '../types'
export const things = { id: t() }
`)
    const result = parseRegularTableExport(file, 'things')
    expect([...result!.imports.keys()]).toEqual(['drizzle-orm/sqlite-core', join(dir, '..', 'types').replace(/\\/g, '/')])
    expect(result!.imports.get('drizzle-orm/sqlite-core')).toEqual(new Set(['text as t', 'type Foo']))
    expect([...result!.imports.values()][1]).toEqual(new Set(['type Bar', 'type Baz as Qux']))
  })

  it('supports a member-expression callee and multiple declarators in one statement', () => {
    const file = write('multi.sqlite.ts', `import * as core from 'drizzle-orm/sqlite-core'
export const version = 1, things = core.sqliteTable('things', { id: core.text() }), wrapped = things as const
`)
    expect(parseRegularTableExport(file, 'things')!.tableCall).toEqual({ callee: 'core.sqliteTable', tableName: 'things' })
    expect(parseRegularTableExport(file, 'version')).toBeUndefined()
    expect(parseRegularTableExport(file, 'wrapped')).toBeUndefined()
    expect(listRegularTableExportNames(file)).toEqual(['things'])
  })

  it('throws a readable error naming the file when it cannot be parsed', () => {
    const file = write('broken.sqlite.ts', `export const things = sqliteTable('things', {\n  id: text(\n})\n`)
    expect(() => parseRegularTableExport(file, 'things')).toThrow(file)
    expect(() => listRegularTableExportNames(file)).toThrow(/broken\.sqlite\.ts/)
  })
})
