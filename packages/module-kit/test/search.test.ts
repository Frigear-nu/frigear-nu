import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { SQLiteSyncDialect, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { PgDialect, pgTable, text as pgText } from 'drizzle-orm/pg-core'
import { foldSearch, localizePath, searchContains, searchText } from '../src/runtime/server'
import { compareSchemaDialects } from '../src/runtime/utils/schema-parity'

// The column as module schemas declare it, in both dialects.
const things = sqliteTable('things', { id: text().primaryKey(), searchText: text().notNull().default('') })
const pgThings = pgTable('things', { id: pgText().primaryKey(), searchText: pgText().notNull().default('') })

describe('searchText', () => {
  it('folds capital Ø, Æ and Å like ASCII letters', () => {
    expect(searchText('ØLFESTIVAL')).toBe('ølfestival')
    expect(searchText('Æblegård')).toBe('æblegård')
    expect(searchText('ÅRHUS Bar')).toBe('århus bar')
    expect(foldSearch('ØÆÅ')).toBe('øæå')
  })

  it('takes every language of a translated text, never its keys, one text per line', () => {
    expect(searchText({ da: 'Øl', en: 'Beer' }, 'ol-bar')).toBe('øl\nbeer\nol-bar')
    expect(searchText(null, undefined, '', ['  Å  ', { da: 'Æ', icon: 3 }])).toBe('å\næ\n3')
  })

  it('folds decomposed letters to the same text as composed ones', () => {
    expect(searchText('Århus')).toBe(searchText('Århus'))
  })
})

describe('searchContains', () => {
  it('matches the folded term literally on both dialects', () => {
    const sqlite = new SQLiteSyncDialect().sqlToQuery(searchContains(things.searchText, ' 50%_ØL '))
    expect(sqlite.sql).toBe('"things"."searchText" like ? escape \'\\\'')
    expect(sqlite.params).toEqual(['%50\\%\\_øl%'])
    const pg = new PgDialect().sqlToQuery(searchContains(pgThings.searchText, 'Århus'))
    expect(pg.sql).toBe('"things"."searchText" like $1 escape \'\\\'')
    expect(pg.params).toEqual(['%århus%'])
  })

  it('finds names with capital Ø, Æ and Å on sqlite, whatever case the term has', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('create table things (id text primary key, searchText text not null default \'\')')
    const insert = db.prepare('insert into things (id, searchText) values (?, ?)')
    insert.run('a', searchText({ da: 'ØLFESTIVAL', en: 'Beer festival' }))
    insert.run('b', searchText('Æblegården'))
    insert.run('c', searchText('Bar i ÅRHUS'))
    const find = (term: string) => {
      const query = new SQLiteSyncDialect().sqlToQuery(searchContains(things.searchText, term))
      return (db.prepare(`select id from things where ${query.sql.replaceAll('"things".', '')} order by id`).all(...query.params as string[]) as Array<{ id: string }>).map(row => row.id)
    }
    expect(find('ølfestival')).toEqual(['a'])
    expect(find('ØLFEST')).toEqual(['a'])
    expect(find('Øl')).toEqual(['a'])
    expect(find('BEER')).toEqual(['a'])
    expect(find('æble')).toEqual(['b'])
    expect(find('ÆBLEGÅRDEN')).toEqual(['b'])
    expect(find('århus')).toEqual(['c'])
    expect(find('Å')).toEqual(['b', 'c'])
    expect(find('%')).toEqual([])
    db.close()
  })

  it('declares the column the same way on both dialects', () => {
    expect(compareSchemaDialects({ things }, { things: pgThings })).toEqual([])
  })
})

describe('localizePath', () => {
  const i18n = { strategy: 'prefix_except_default', defaultLocale: 'da', locales: ['da', 'en'] }

  it('adds the prefix of a locale other than the default', () => {
    expect(localizePath('/crew/status', 'da', i18n)).toBe('/crew/status')
    expect(localizePath('/crew/status', 'da-DK', i18n)).toBe('/crew/status')
    expect(localizePath('/crew/status', 'en', i18n)).toBe('/en/crew/status')
    expect(localizePath('/help/a/b', 'en_GB', i18n)).toBe('/en/help/a/b')
  })

  it('prefixes every locale with `prefix` and `prefix_and_default`', () => {
    expect(localizePath('/help/a/b', 'da', { ...i18n, strategy: 'prefix' })).toBe('/da/help/a/b')
    expect(localizePath('/help/a/b', 'da', { ...i18n, strategy: 'prefix_and_default' })).toBe('/da/help/a/b')
  })

  it('leaves the path without i18n, a prefix strategy or a known locale', () => {
    expect(localizePath('/help', 'en', null)).toBe('/help')
    expect(localizePath('/help', 'en', undefined)).toBe('/help')
    expect(localizePath('/help', 'en', { ...i18n, strategy: 'no_prefix' })).toBe('/help')
    expect(localizePath('/help', 'sv', i18n)).toBe('/help')
    expect(localizePath('/help', 'de', i18n)).toBe('/help')
    expect(localizePath('/help', undefined, i18n)).toBe('/help')
    expect(localizePath('/help', null, i18n)).toBe('/help')
  })
})
