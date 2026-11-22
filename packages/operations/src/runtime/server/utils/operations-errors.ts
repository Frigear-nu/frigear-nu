import { conflict, isUniqueViolation } from '@frigear-nu/module-kit/server'

/**
 * Two requests can pass the slug pre-check together: the unique index decides, and the loser gets the same 409. Any
 * other database error (a foreign key, NOT NULL) is rethrown as it is.
 */
export function rethrowOperationSlugConflict(error: unknown): never {
  if (isUniqueViolation(error)) throw conflict('An operation with this slug already exists.', { field: 'slug' })
  throw error
}
