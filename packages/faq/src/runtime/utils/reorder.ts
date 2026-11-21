/** What a submitted order gets wrong compared with the group's items. All empty when it is valid. */
export type ReorderProblems = {
  /** Ids of the group's items that the order leaves out. */
  missing: string[]
  /** Ids in the order that are not items of the group. */
  unknown: string[]
  /** Ids that appear more than once. */
  duplicates: string[]
}

/**
 * Checks a reorder request: `submitted` must list exactly the ids of `current`, each once. Anything else could drop
 * an item from the order or move an item of another group, so the route refuses it with `400`.
 */
export function checkReorder(current: readonly string[], submitted: readonly string[]): ReorderProblems {
  const known = new Set(current)
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  const unknown: string[] = []
  for (const id of submitted) {
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
    if (!known.has(id)) unknown.push(id)
  }
  return {
    missing: current.filter(id => !seen.has(id)),
    unknown: [...new Set(unknown)],
    duplicates: [...duplicates],
  }
}

export const isValidReorder = (problems: ReorderProblems) =>
  !problems.missing.length && !problems.unknown.length && !problems.duplicates.length

/** Moves `from` to `to` in a copy of `ids` (the up/down buttons and the drag handle of the editor). */
export function moveId(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids]
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}
