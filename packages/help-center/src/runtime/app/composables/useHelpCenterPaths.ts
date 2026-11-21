import { createHelpCenterPaths } from '../../utils/paths'
import { useLocaleLink, useRuntimeConfig } from '#imports'

/**
 * Locale-aware links to every page of the help center. Always use these instead of building a path by hand: they follow
 * `helpCenter.settings.pages` (`/help`, `/account/help`, the admin path), keep the locale prefix, and are `undefined`
 * for an area that is off.
 *
 *     const paths = useHelpCenterPaths()
 *     paths.signedIn.article('safety', 'first-aid')
 */
export function useHelpCenterPaths() {
  const { localize } = useLocaleLink()
  const pages = useRuntimeConfig().public.helpCenter?.pages
  const base = createHelpCenterPaths({ public: pages?.public, signedIn: pages?.signedIn })
  const local = (path: string | undefined) => path ? localize(path) : undefined
  const area = (paths: typeof base.public) => ({
    base: paths.base,
    index: () => local(paths.index()),
    category: (category: string) => local(paths.category(category)),
    article: (category: string, slug: string) => local(paths.article(category, slug)),
  })
  return {
    public: area(base.public),
    signedIn: area(base.signedIn),
    admin: () => local(pages?.admin),
    adminChecklist: (id: string) => local(pages?.adminChecklist?.replace(':id', encodeURIComponent(id))),
  }
}

export type UseHelpCenterPaths = ReturnType<typeof useHelpCenterPaths>
