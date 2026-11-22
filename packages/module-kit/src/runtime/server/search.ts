import { sql } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'
import { escapeLike } from './pagination'

/**
 * A value a search column is built from: a text, a translated text (`{ da: '...', en: '...' }`, every language counts),
 * a list of either, or nothing.
 */
export type SearchSource = string | number | null | undefined | { readonly [locale: string]: unknown } | readonly SearchSource[]

/**
 * Folds a text for searching: Unicode normalisation (NFC) and the Unicode lowercase mapping, so `Ø`, `Æ` and `Å` fold
 * to `ø`, `æ` and `å` like ASCII letters do. Not locale dependent (`toLowerCase`, not `toLocaleLowerCase`).
 */
export const foldSearch = (value: string): string => value.normalize('NFC').toLowerCase()

const collect = (value: SearchSource, texts: string[]) => {
  if (value === null || value === undefined) return
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim()
    if (text) texts.push(text)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item as SearchSource, texts)
    return
  }
  for (const item of Object.values(value)) {
    if (typeof item === 'string' || typeof item === 'number') collect(item, texts)
  }
}

/**
 * The value of a normalised search column: every text of `values` folded with {@link foldSearch}, one per line (a
 * translated text gives each language, never its locale keys). Write it on every insert and on every update that
 * changes one of its sources, and search it with {@link searchContains}.
 *
 * sqlite's `lower()` and `LIKE` fold ASCII letters only, so a search of the stored text misses `Ølbar` for `ølbar`.
 * Folding in JavaScript on write, and the search term the same way on read, finds it on both dialects.
 *
 * The column is a plain text column, declared the same way in both schema files (they are merged as text, so they
 * import nothing but drizzle): `searchText: text().notNull().default('')`.
 *
 *     db.insert(operations).values({ ...values, searchText: searchText(values.name, values.slug) })
 */
export function searchText(...values: SearchSource[]): string {
  const texts: string[] = []
  for (const value of values) collect(value, texts)
  return foldSearch(texts.join('\n'))
}

/**
 * A normalised search column (see {@link searchText}) contains `term`: the term is folded the same way and matched
 * literally (`%` and `_` escaped). The same SQL on both dialects; the column is already folded, so it is not wrapped in
 * `lower()`.
 */
export const searchContains = (column: AnyColumn | SQL, term: string): SQL =>
  sql`${column} like ${`%${escapeLike(foldSearch(term.trim()))}%`} escape '\\'`
