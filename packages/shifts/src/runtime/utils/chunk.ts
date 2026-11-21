/**
 * How many ids one `inArray` lookup holds: Cloudflare D1 allows at most 100 bound parameters per statement, so lookups
 * by a list of ids run in chunks below that (the rest of the statement binds a few parameters of its own).
 */
export const SHIFTS_ID_CHUNK = 90

/** Splits a list into chunks of at most `size` (at least one item each); an empty list is no chunks. */
export function shiftsChunk<T>(items: readonly T[], size: number = SHIFTS_ID_CHUNK): T[][] {
  const step = Math.max(1, Math.floor(size))
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += step) chunks.push(items.slice(index, index + step))
  return chunks
}
