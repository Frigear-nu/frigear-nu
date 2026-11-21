/** Lowercase letters, numbers and single dashes between them. */
export const HELP_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * URL names that would shadow a route word: the segments next to a category or an article in `/api/help-center/...`
 * and in the pages (`search`, `categories`, `articles`, `me`) and the words an app puts next to a page (`new`, `edit`,
 * `admin`, `api`).
 */
export const RESERVED_HELP_SLUGS = ['search', 'categories', 'articles', 'me', 'new', 'edit', 'admin', 'api'] as const

export function isReservedHelpSlug(slug: string): boolean {
  return (RESERVED_HELP_SLUGS as readonly string[]).includes(slug)
}

/** Whether `slug` is a usable URL name: well formed, at most 128 characters and not a reserved word. */
export function isValidHelpSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 128 && HELP_SLUG_PATTERN.test(slug) && !isReservedHelpSlug(slug)
}
