import { describe, expect, it } from 'vitest'
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

  it('does not include the default export', () => {
    const file = fileURLToPath(new URL('./fixtures/regular/default-export.sqlite.ts', import.meta.url))
    expect(listRegularTableExportNames(file)).toEqual([])
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
