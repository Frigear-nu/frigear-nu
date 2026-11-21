/** The optional `phone` column of the host's `users` table, or `undefined` when the app has none. */
export function phoneColumnOf<C>(users: object): C | undefined {
  return (users as Record<string, C | undefined>).phone ?? undefined
}

/** A usable phone number from a column value: a trimmed, non-empty string, else `null`. */
export function normalizePhone(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
