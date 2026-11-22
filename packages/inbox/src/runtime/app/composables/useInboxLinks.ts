import { useLocaleLink, useRuntimeConfig } from '#imports'

/**
 * Locale-aware links to the staff inbox pages (`inbox.settings.pages`). Each returns `undefined` when that page is off.
 */
export function useInboxLinks() {
  const { localize } = useLocaleLink()
  const pages = useRuntimeConfig().public.inbox?.pages ?? {}

  return {
    /** The thread list, optionally with filters in the query. */
    admin: (query?: Record<string, string>) => {
      if (!pages.admin) return undefined
      const search = query ? new URLSearchParams(query).toString() : ''
      return localize(search ? `${pages.admin}?${search}` : pages.admin)
    },
    /** One thread. */
    thread: (id: string) => pages.adminThread ? localize(pages.adminThread.replace(':id', encodeURIComponent(id))) : undefined,
    /** Mailbox and channel settings. */
    settings: () => pages.adminSettings ? localize(pages.adminSettings) : undefined,
  }
}
