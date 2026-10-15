/** The configured page paths (`public.events.pages`), each possibly with a `:slug` / `:id` param. */
export type EventPages = { events?: string, event?: string, tickets?: string, admin?: string, adminEvent?: string }

/** Fills a `:param` of a page path with a URL-safe value. */
export function fillPath(pattern: string, param: 'slug' | 'id', value: string): string {
  return pattern.replace(`:${param}`, encodeURIComponent(value))
}

/**
 * Builds every link to an event page. All of them go through `localize` (the active locale's prefix, see
 * `useLocaleLink` of `@frigear-nu/ui`), so a visitor browsing `/en/events` stays under `/en` when opening an event.
 */
export function createEventLinks(pages: EventPages | undefined, localize: (path: string) => string) {
  return {
    events: () => localize(pages?.events || '/events'),
    event: (slug: string) => localize(fillPath(pages?.event || '/events/:slug', 'slug', slug)),
    tickets: () => localize(pages?.tickets || '/account/tickets'),
    admin: () => localize(pages?.admin || '/admin/events'),
    adminEvent: (id: string) => localize(fillPath(pages?.adminEvent || '/admin/events/:id', 'id', id)),
  }
}
