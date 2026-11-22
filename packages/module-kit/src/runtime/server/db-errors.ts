type DriverError = { code?: unknown, extendedCode?: unknown, message?: unknown, cause?: unknown }

/** Whether `error`, or an error in its `cause` chain (drivers and drizzle wrap them), matches `test`. */
function inCauseChain(error: unknown, test: (error: DriverError) => boolean): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    if (test(current as DriverError)) return true
    current = (current as DriverError).cause
  }
  return false
}

const codeIn = (error: DriverError, codes: string[]) =>
  (typeof error.code === 'string' && codes.includes(error.code))
  || (typeof error.extendedCode === 'string' && codes.includes(error.extendedCode))

/**
 * Whether a database error is a unique or primary-key violation: postgresql `23505`, sqlite
 * `SQLITE_CONSTRAINT_UNIQUE` / `SQLITE_CONSTRAINT_PRIMARYKEY` (as `code` or libsql's `extendedCode`), or the
 * "UNIQUE constraint failed" message of D1 and libsql. Any other constraint (foreign key, NOT NULL, check) is `false`.
 *
 *     catch (error) {
 *       if (isUniqueViolation(error)) throw conflict('A team with this slug already exists.', { field: 'slug' })
 *       throw error
 *     }
 */
export function isUniqueViolation(error: unknown): boolean {
  return inCauseChain(error, e => e.code === '23505'
    || codeIn(e, ['SQLITE_CONSTRAINT_UNIQUE', 'SQLITE_CONSTRAINT_PRIMARYKEY'])
    || (typeof e.message === 'string' && /UNIQUE constraint failed/i.test(e.message)))
}

/**
 * Whether a database error is a foreign-key violation: postgresql `23503`, sqlite `SQLITE_CONSTRAINT_FOREIGNKEY`, or
 * the "FOREIGN KEY constraint failed" message of D1 and libsql. For a row that is still referenced, or a missing target.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return inCauseChain(error, e => e.code === '23503'
    || codeIn(e, ['SQLITE_CONSTRAINT_FOREIGNKEY'])
    || (typeof e.message === 'string' && /FOREIGN KEY constraint failed/i.test(e.message)))
}
