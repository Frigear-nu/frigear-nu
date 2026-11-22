import { asc, eq, getTableColumns, getTableName, gt } from 'drizzle-orm'
import type { AnyColumn, InferSelectModel, SQL, Table } from 'drizzle-orm'

/**
 * How a module's normalised search columns (see `searchText`) are computed from a row, for the `search:reindex` task.
 * `columns` must be the same code the module runs on write, so a reindex stores exactly what a save would.
 *
 *     export default defineSearchIndex({
 *       table: schema.operations,
 *       columns: row => ({ searchText: operationSearchText(row) }),
 *     })
 */
export interface SearchIndexDefinition<TTable extends Table = Table> {
  /** The drizzle table (from `schema` of `@nuxthub/db`). It needs an `id` column; rows are walked in `id` order. */
  table: TTable
  /** The search column values of a row, by their drizzle property name (`searchText`, `searchBody`). */
  columns: (row: InferSelectModel<TTable>) => Record<string, string>
}

/** Declares a search index (see {@link SearchIndexDefinition}); the default export of a file passed to `registerSearchIndex`. */
export const defineSearchIndex = <TTable extends Table>(definition: SearchIndexDefinition<TTable>): SearchIndexDefinition<TTable> => definition

/** What one reindex of a table did. */
export interface SearchReindexResult {
  table: string
  /** Rows read. */
  scanned: number
  /** Rows whose search columns differed and were rewritten. */
  updated: number
}

type Row = Record<string, unknown>

/**
 * The part of a drizzle database the reindex uses: `db` of `@nuxthub/db` on either dialect, or any drizzle database.
 * Every statement binds at most a handful of parameters (no `IN` lists), so it stays under D1's limit of 100.
 */
export interface SearchIndexDatabase {
  select: () => { from: (table: Table) => { where: (where: SQL | undefined) => { orderBy: (order: SQL) => { limit: (limit: number) => PromiseLike<Row[]> } } } }
  update: (table: Table) => { set: (values: Row) => { where: (where: SQL) => PromiseLike<unknown> } }
}

/** Rows read per page. */
export const SEARCH_REINDEX_PAGE_SIZE = 200

/**
 * Recomputes the search columns of every row of `definition.table`, in pages ordered by `id`, and updates only the rows
 * whose stored value differs. Idempotent: a second run updates nothing.
 */
export async function reindexSearchIndex(
  db: SearchIndexDatabase,
  definition: SearchIndexDefinition,
  options: { pageSize?: number } = {},
): Promise<SearchReindexResult> {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? SEARCH_REINDEX_PAGE_SIZE))
  const { table } = definition
  const name = getTableName(table)
  const columns = getTableColumns(table) as Record<string, AnyColumn>
  const id = columns.id
  if (!id) throw new Error(`[@frigear-nu/module-kit] search:reindex: table "${name}" has no \`id\` column.`)

  const result: SearchReindexResult = { table: name, scanned: 0, updated: 0 }
  let cursor: unknown
  for (;;) {
    const rows = await db.select().from(table)
      .where(cursor === undefined ? undefined : gt(id, cursor))
      .orderBy(asc(id))
      .limit(pageSize)
    for (const row of rows) {
      result.scanned++
      const values = definition.columns(row as InferSelectModel<Table>)
      const changed: Row = {}
      for (const [key, value] of Object.entries(values)) {
        if (!(key in columns)) throw new Error(`[@frigear-nu/module-kit] search:reindex: table "${name}" has no column "${key}".`)
        if (row[key] !== value) changed[key] = value
      }
      if (Object.keys(changed).length) {
        await db.update(table).set(changed).where(eq(id, row.id))
        result.updated++
      }
    }
    if (rows.length < pageSize) break
    cursor = rows[rows.length - 1]!.id
  }
  return result
}
