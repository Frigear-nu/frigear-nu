/** Lowercase letters, numbers and single dashes between them. */
export const FAQ_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * URL names that would shadow a route word: the segments next to a group in `/api/faq/...` (`search`, `groups`,
 * `items`) and the words an app puts next to a page (`new`, `edit`, `admin`, `api`).
 */
export const RESERVED_FAQ_SLUGS = ['search', 'groups', 'items', 'new', 'edit', 'admin', 'api'] as const

export function isReservedFaqSlug(slug: string): boolean {
  return (RESERVED_FAQ_SLUGS as readonly string[]).includes(slug)
}

/** Whether `slug` is a usable URL name: well formed, at most 128 characters and not a reserved word. */
export function isValidFaqSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 128 && FAQ_SLUG_PATTERN.test(slug) && !isReservedFaqSlug(slug)
}
