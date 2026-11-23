import { DatabaseSync } from 'node:sqlite'
import { $fetch } from '@nuxt/test-utils/e2e'
import type { SearchReindexResult } from '../server/search-index'

/**
 * Runs the `search:reindex` task on the fixture started by `setup()` (a `dev: true` fixture: Nitro serves its tasks at
 * `/_nitro/tasks/<name>` in dev only) and returns the result per table.
 */
export async function runSearchReindex(): Promise<SearchReindexResult[]> {
  const { result } = await $fetch<{ result: SearchReindexResult[] }>('/_nitro/tasks/search:reindex')
  return result
}

/** The result of `table` in a `runSearchReindex()` result. */
export const reindexOf = (results: SearchReindexResult[], table: string): SearchReindexResult | undefined =>
  results.find(result => result.table === table)

/**
 * Runs `statement` on a fixture's sqlite file (NuxtHub's `<fixture>/.data/db/sqlite.db`) outside the app, for example
 * to store what a SQL backfill stores (`update users set searchText = lower(name)`: sqlite's `lower()` folds ASCII
 * only) before a reindex. `query` returns the rows of a select.
 */
export function fixtureSqlite(file: string) {
  return {
    exec(statement: string, ...params: Array<string | number | null>) {
      const db = new DatabaseSync(file)
      try {
        db.prepare(statement).run(...params)
      }
      finally {
        db.close()
      }
    },
    query<T = Record<string, unknown>>(statement: string, ...params: Array<string | number | null>): T[] {
      const db = new DatabaseSync(file, { readOnly: true })
      try {
        return db.prepare(statement).all(...params) as T[]
      }
      finally {
        db.close()
      }
    },
  }
}
