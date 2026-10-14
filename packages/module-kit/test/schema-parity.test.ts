import { describe, expect, it } from 'vitest'
import { existsSync, globSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { boolean, index, integer as pgInteger, pgTable, text as pgText, timestamp } from 'drizzle-orm/pg-core'
import { integer, sqliteTable, text, index as sqliteIndex } from 'drizzle-orm/sqlite-core'
import { compareSchemaDialects, expectSchemaParity } from '../src/runtime/utils/schema-parity'
import * as sqliteAccounts from './fixtures/regular/schema.sqlite'
import * as postgresqlAccounts from './fixtures/regular/schema.postgresql'

const sqliteSchema = {
  posts: sqliteTable('posts', {
    id: text().primaryKey(),
    authorId: integer().notNull(),
    published: integer({ mode: 'boolean' }).notNull().default(false),
    createdAt: integer({ mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  }, t => [sqliteIndex('post_author_idx').on(t.authorId)]),
}

describe('compareSchemaDialects', () => {
  it('accepts tables that only differ in their dialect-specific SQL types', () => {
    const postgresql = {
      posts: pgTable('posts', {
        id: pgText().primaryKey(),
        authorId: pgInteger().notNull(),
        published: boolean().notNull().default(false),
        createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
      }, t => [index('post_author_idx').on(t.authorId)]),
    }
    expect(compareSchemaDialects(sqliteSchema, postgresql)).toEqual([])
    expect(compareSchemaDialects(sqliteAccounts, postgresqlAccounts)).toEqual([])
  })

  it('reports renamed columns, type drift, missing indexes and missing tables', () => {
    const postgresql = {
      posts: pgTable('posts', {
        id: pgText().primaryKey(),
        author: pgInteger().notNull(),
        published: pgText().notNull().default('false'),
        createdAt: timestamp({ withTimezone: true }).notNull().$defaultFn(() => new Date()),
      }),
      comments: pgTable('comments', { id: pgText().primaryKey() }),
    }
    const differences = compareSchemaDialects(sqliteSchema, postgresql)
    expect(differences).toEqual(expect.arrayContaining([
      expect.stringContaining('posts.columns.authorId'),
      expect.stringContaining('posts.columns.author:'),
      expect.stringContaining('posts.columns.published.dataType'),
      expect.stringContaining('posts.indexes.post_author_idx'),
      'comments: only exported by postgresql',
    ]))
    expect(() => expectSchemaParity(sqliteSchema, postgresql)).toThrow(/out of sync/)
  })
})

describe('dialect twins', () => {
  // Every module schema and layer extension file ships for both dialects, so a postgresql host gets the same tables.
  it('has a .postgresql.ts file next to every .sqlite.ts schema file', () => {
    const root = fileURLToPath(new URL('../../..', import.meta.url))
    const sqliteFiles = globSync(['packages/*/src/**/*.sqlite.ts', 'packages/*/playground/**/server/db/*.sqlite.ts', 'apps/*/server/db/*.sqlite.ts'], { cwd: root })
    expect(sqliteFiles.length).toBeGreaterThan(0)
    const missing = sqliteFiles.filter(file => !existsSync(`${root}/${file.replace(/\.sqlite\.ts$/, '.postgresql.ts')}`))
    expect(missing).toEqual([])
  })
})
