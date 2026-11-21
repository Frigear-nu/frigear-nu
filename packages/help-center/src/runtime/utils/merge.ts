// How the article sources are combined. Pure, so the order and the merge are tested without a server.

/**
 * The source ids in the order they are merged: as listed, with the one named by `precedence` first, because the first
 * source that has a slug wins a clash. An id that is not listed is not added; the order of the others is kept.
 */
export function orderSourceIds(ids: readonly string[], precedence: string): string[] {
  return [...ids].sort((a, b) => Number(b === precedence) - Number(a === precedence))
}

/** Keeps the first entry of each slug, so the source that comes first wins a clash. */
export function mergeBySlug<T extends { slug: string }>(lists: readonly (readonly T[])[]): T[] {
  const seen = new Set<string>()
  const merged: T[] = []
  for (const entry of lists.flat()) {
    if (seen.has(entry.slug)) continue
    seen.add(entry.slug)
    merged.push(entry)
  }
  return merged
}
