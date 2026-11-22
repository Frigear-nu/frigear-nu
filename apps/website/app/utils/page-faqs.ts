/** `appConfig.pageFaqs`: the help-center category slugs whose FAQ cards a page shows, by page key. */
export type PageFaqsConfig = Record<string, string | readonly string[] | null | undefined>

/** The category slugs configured for `page`, trimmed and without repeats; none when the page has none. */
export function pageFaqSlugs(config: PageFaqsConfig | null | undefined, page: string): string[] {
  const value = config?.[page]
  const list = typeof value === 'string' ? value.split(',') : [...(value ?? [])]
  return [...new Set(list.map(slug => slug.trim()).filter(Boolean))]
}

/**
 * How many of the loaded categories have something to show: a category without a published article (staff made it
 * but published nothing yet, or unpublished everything) does not count.
 */
export function pageFaqsFound(faqs: ReadonlyArray<{ articles?: readonly unknown[] | null }> | null | undefined): number {
  return (faqs ?? []).filter(faq => (faq.articles?.length ?? 0) > 0).length
}

/**
 * Whether a page's FAQ section shows: while its categories load (the cards render their skeleton), and afterwards only
 * when at least one of them exists, is public and has a published article (`pageFaqsFound`). A missing or empty
 * category, or a failed request, hides the section.
 */
export function showPageFaqs(state: { slugs: readonly string[], status: string, found: number }): boolean {
  if (!state.slugs.length) return false
  if (state.status === 'idle' || state.status === 'pending') return true
  return state.status === 'success' && state.found > 0
}
