/**
 * How many values one `IN (...)` list holds by default. Cloudflare D1 binds at most 100 parameters per statement and
 * the rest of a query needs a few of its own, so lists are cut at 90.
 */
export const D1_PARAM_CHUNK = 90

/**
 * Splits `values` into lists of at most `size` (at least 1), in order. An empty list is no chunks, so a loop over the
 * result runs no query.
 *
 *     for (const ids of chunkParams(userIds)) rows.push(...await db.select().from(users).where(inArray(users.id, ids)))
 */
export function chunkParams<T>(values: readonly T[], size: number = D1_PARAM_CHUNK): T[][] {
  const step = Math.max(1, Math.floor(size))
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += step) chunks.push(values.slice(index, index + step))
  return chunks
}

/**
 * Runs `query` once per chunk of `values` (see {@link chunkParams}), one after the other, and joins the rows. Every
 * statement binds at most `size` of the values, so an `inArray` lookup by any number of ids stays under D1's limit.
 * Joining the chunks with `or(...)` in one statement would bind them all again, so it does not help.
 *
 *     const rows = await inChunks(ids, part => db.select().from(teams).where(inArray(teams.id, part)))
 */
export async function inChunks<T, R>(values: readonly T[], query: (chunk: T[]) => Promise<R[]>, size: number = D1_PARAM_CHUNK): Promise<R[]> {
  const rows: R[] = []
  for (const chunk of chunkParams(values, size)) rows.push(...await query(chunk))
  return rows
}
