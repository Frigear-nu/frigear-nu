/**
 * Whether a database error is a unique-constraint violation: sqlite (exactly `SQLITE_CONSTRAINT_UNIQUE`, never another constraint such as a foreign key, or the message of
 * libsql / D1 "UNIQUE constraint failed") and postgresql (`23505`). Drivers wrap the error, so the `cause` chain is
 * followed too.
 */
export function isFaqUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const { code, message, cause } = current as { code?: unknown, message?: unknown, cause?: unknown }
    if (code === '23505') return true
    if (code === 'SQLITE_CONSTRAINT_UNIQUE') return true
    if (typeof message === 'string' && /UNIQUE constraint failed/i.test(message)) return true
    current = cause
  }
  return false
}
