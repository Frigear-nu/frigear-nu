/** D1 allows 100 bound parameters per query: keep an `IN (...)` list well under it. */
export const IN_LIST_LIMIT = 90

/** Splits a list into pieces of at most `size`. */
export function chunk<T>(list: readonly T[], size: number = IN_LIST_LIMIT): T[][] {
  const pieces: T[][] = []
  for (let index = 0; index < list.length; index += size) pieces.push(list.slice(index, index + size))
  return pieces
}
