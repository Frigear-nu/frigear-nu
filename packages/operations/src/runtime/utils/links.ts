/** The configured page paths (`public.operations.pages`), each possibly with a `:slug` / `:id` param. */
export type OperationPages = { public?: string, admin?: string, adminOperation?: string }

/** Fills a `:param` of a page path with a URL-safe value. */
export function fillPath(pattern: string, param: 'slug' | 'id', value: string): string {
  return pattern.replace(`:${param}`, encodeURIComponent(value))
}

/**
 * Builds every link to an operation page. All of them go through `localize` (the active locale's prefix, see
 * `useLocaleLink` of `@frigear-nu/ui`), so a visitor browsing `/en/operations/...` stays under `/en`.
 */
export function createOperationLinks(pages: OperationPages | undefined, localize: (path: string) => string) {
  return {
    operation: (slug: string) => localize(fillPath(pages?.public || '/operations/:slug', 'slug', slug)),
    admin: () => localize(pages?.admin || '/admin/operations'),
    adminOperation: (id: string) => localize(fillPath(pages?.adminOperation || '/admin/operations/:id', 'id', id)),
  }
}
