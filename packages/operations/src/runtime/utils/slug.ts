/** Lowercase letters, numbers and single dashes between them. */
export const OPERATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * URL names that would shadow a route word: `me` is the static segment of `/api/operations/me`, the others are the
 * words an app puts next to an operation's page (`/operations/new`, `/admin/operations/...`).
 */
export const RESERVED_OPERATION_SLUGS = ['me', 'new', 'edit', 'admin', 'api'] as const

export function isReservedOperationSlug(slug: string): boolean {
  return (RESERVED_OPERATION_SLUGS as readonly string[]).includes(slug)
}

/** Whether `slug` is a usable URL name: well formed, at most 128 characters and not a reserved word. */
export function isValidOperationSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 128 && OPERATION_SLUG_PATTERN.test(slug) && !isReservedOperationSlug(slug)
}
