/** `appConfig.pageFaqs`: the help-center category slugs whose FAQ cards a page shows, by page key. */
export type PageFaqsConfig = Record<string, string | readonly string[] | null | undefined>

/** The category slugs configured for `page`, trimmed and without repeats; none when the page has none. */
export function pageFaqSlugs(config: PageFaqsConfig | null | undefined, page: string): string[] {
  const value = config?.[page]
  const list = typeof value === 'string' ? value.split(',') : [...(value ?? [])]
  return [...new Set(list.map(slug => slug.trim()).filter(Boolean))]
}

/**
 * Whether a page's FAQ section shows: while its categories load (the cards render their skeleton), and afterwards only
 * when at least one of them exists and is public. A missing category, or a failed request, hides the section.
 */
export function showPageFaqs(state: { slugs: readonly string[], status: string, found: number }): boolean {
  if (!state.slugs.length) return false
  if (state.status === 'idle' || state.status === 'pending') return true
  return state.status === 'success' && state.found > 0
}
