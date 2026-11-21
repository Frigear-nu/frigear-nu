/** Moves the entry at `from` to `to` in a copy of `list` (the up and down buttons of the checklist builder). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}
