import { asc, desc, sql } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'
import { z } from 'zod'

/** One page of a paginated admin list: the shape `useTableQuery` (`@frigear-nu/ui`) reads. */
export type Page<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export type PageQueryOptions<S extends string, F extends z.ZodRawShape> = {
  /** The columns a client may sort by (the `sort` query key). */
  sort: readonly [S, ...S[]]
  /** The sort when the query has none. Defaults to the first of `sort`. */
  defaultSort?: NoInfer<S>
  /** The order when the query has none. Defaults to `desc`. */
  defaultOrder?: 'asc' | 'desc'
  /** Rows per page when the query has none. Defaults to 20. */
  defaultPageSize?: number
  /** The largest page a client may ask for. Defaults to 100. */
  maxPageSize?: number
  /** Extra filter keys (e.g. `{ status: z.enum([...]).optional() }`); `useTableQuery` sends them next to `q`. */
  filters?: F
}

/**
 * The query schema of a paginated list, for `getValidatedQuery(event, schema.parse)`. It speaks the vocabulary of
 * `useTableQuery`: `page`, `pageSize`, `q`, `sort`, `order`, plus the list's own filter keys.
 *
 *     const query = await getValidatedQuery(event, pageQuery({ sort: ['createdAt', 'name'] }).parse)
 */
export function pageQuery<S extends string, F extends z.ZodRawShape = Record<never, never>>(options: PageQueryOptions<S, F>) {
  const maxPageSize = options.maxPageSize ?? 100
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(Math.min(options.defaultPageSize ?? 20, maxPageSize)),
    q: z.string().trim().max(200).optional(),
    sort: z.enum(options.sort as unknown as [S, ...S[]]).default((options.defaultSort ?? options.sort[0]) as never),
    order: z.enum(['asc', 'desc']).default(options.defaultOrder ?? 'desc'),
    ...(options.filters ?? {} as F),
  })
}

/** `limit`/`offset` for a parsed page query. */
export const pageRange = (query: { page: number, pageSize: number }) => ({
  limit: query.pageSize,
  offset: (query.page - 1) * query.pageSize,
})

/** Wraps one page of rows in the paginated response shape. */
export function paginate<T>(options: { items: T[], total: number, query: { page: number, pageSize: number } }): Page<T> {
  return { items: options.items, total: options.total, page: options.query.page, pageSize: options.query.pageSize }
}

/** Escapes LIKE wildcards so a search for `50%` matches literally. Use with `likeEscaped`. */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, char => `\\${char}`)

/**
 * Case-insensitive `lower(column) LIKE lower(pattern) ESCAPE '\'`, the counterpart of `escapeLike`. The same SQL on
 * sqlite and postgresql (postgresql's `LIKE` is case-sensitive, hence `lower()` on both sides).
 */
export const likeEscaped = (column: AnyColumn | SQL, pattern: string): SQL => sql`lower(${column}) like lower(${pattern}) escape '\\'`

/** `column` contains `value`, case-insensitively and literally (wildcards in `value` escaped). */
export const likeContains = (column: AnyColumn | SQL, value: string): SQL => likeEscaped(column, `%${escapeLike(value)}%`)

/**
 * The `orderBy` of a parsed page query: the column `columns[query.sort]` in `query.order`, then `tiebreaker`
 * descending (usually the primary key), which keeps pages stable when many rows share the sort value. A sort key
 * whose column is `undefined` (e.g. an optional column that is not installed) sorts by the tiebreaker alone.
 *
 *     db.select().from(t).orderBy(...orderByQuery({ name: t.name, createdAt: t.createdAt }, query, { tiebreaker: t.id }))
 */
export function orderByQuery<S extends string>(
  columns: Record<S, AnyColumn | SQL | undefined>,
  query: { sort: S, order: 'asc' | 'desc' },
  options: { tiebreaker?: AnyColumn | SQL } = {},
): SQL[] {
  const column = columns[query.sort]
  const direction = query.order === 'asc' ? asc : desc
  return [
    ...(column ? [direction(column)] : []),
    ...(options.tiebreaker && options.tiebreaker !== column ? [desc(options.tiebreaker)] : []),
  ]
}
