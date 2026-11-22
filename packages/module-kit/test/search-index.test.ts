import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { defineSearchIndex, reindexSearchIndex, searchText } from '../src/runtime/server'
import type { SearchIndexDatabase } from '../src/runtime/server'
import { searchIndexesTemplate } from '../src/runtime/utils/search-index'

const things = sqliteTable('things', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  body: text().notNull().default(''),
  searchText: text('search_text').notNull().default(''),
  searchBody: text('search_body').notNull().default(''),
})

const index = defineSearchIndex({
  table: things,
  columns: row => ({ searchText: searchText(row.name), searchBody: searchText(row.body) }),
})

// A real sqlite database (node:sqlite) behind drizzle, counting the statements it runs.
const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec('create table things (id integer primary key autoincrement, name text not null, body text not null default \'\', search_text text not null default \'\', search_body text not null default \'\')')
  const stats = { maxParams: 0 }
  const db = drizzle(async (query, params, method) => {
    stats.maxParams = Math.max(stats.maxParams, params.length)
    const statement = sqlite.prepare(query)
    if (method === 'run') {
      statement.run(...params as never[])
      return { rows: [] }
    }
    statement.setReturnArrays(true)
    const rows = statement.all(...params as never[]) as unknown as unknown[][]
    return { rows: method === 'get' ? rows[0] as unknown as unknown[] : rows }
  })
  return { sqlite, db: db as unknown as SearchIndexDatabase, stats }
}

describe('reindexSearchIndex', () => {
  it('fixes rows backfilled with an ASCII-only lower() (capital Æ, Ø, Å) and updates nothing on a second run', async () => {
    const { sqlite, db, stats } = open()
    const insert = sqlite.prepare('insert into things (name, body, search_text, search_body) values (?, ?, ?, ?)')
    // What sqlite's `lower()` stores: ASCII folded, Æ/Ø/Å kept.
    insert.run('ØLBAR', 'Åben hver dag', 'Ølbar', 'Åben hver dag')
    insert.run('Æblegården', 'ÆBLER', 'Æblegården', 'Æbler')
    insert.run('ÅRHUS', '', 'Århus', '')
    insert.run('plain', 'text', 'plain', 'text')

    const first = await reindexSearchIndex(db, index, { pageSize: 2 })
    expect(first).toEqual({ table: 'things', scanned: 4, updated: 3 })
    expect(sqlite.prepare('select search_text, search_body from things order by id').all()).toEqual([
      { search_text: 'ølbar', search_body: 'åben hver dag' },
      { search_text: 'æblegården', search_body: 'æbler' },
      { search_text: 'århus', search_body: '' },
      { search_text: 'plain', search_body: 'text' },
    ])

    const second = await reindexSearchIndex(db, index, { pageSize: 2 })
    expect(second).toEqual({ table: 'things', scanned: 4, updated: 0 })
    // Keyset pages and single-row updates: far below D1's 100 bound parameters.
    expect(stats.maxParams).toBeLessThan(10)
    sqlite.close()
  })

  it('walks an empty table', async () => {
    const { sqlite, db } = open()
    expect(await reindexSearchIndex(db, index)).toEqual({ table: 'things', scanned: 0, updated: 0 })
    sqlite.close()
  })

  it('rejects a column the table does not have', async () => {
    const { sqlite, db } = open()
    sqlite.exec('insert into things (name) values (\'x\')')
    await expect(reindexSearchIndex(db, defineSearchIndex({ table: things, columns: () => ({ nope: '' }) }))).rejects.toThrow('no column "nope"')
    sqlite.close()
  })
})

describe('searchIndexesTemplate', () => {
  it('imports every registered index in order', () => {
    expect(searchIndexesTemplate([{ name: 'users', handler: '/a/users.ts' }, { name: 'teams', handler: '/b/teams.ts' }])).toBe([
      'import index0 from "/a/users.ts"',
      'import index1 from "/b/teams.ts"',
      'export const indexes = [',
      '  { name: "users", index: index0 },',
      '  { name: "teams", index: index1 },',
      ']',
      '',
    ].join('\n'))
  })
})
