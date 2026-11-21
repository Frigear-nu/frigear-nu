import { useLocaleLink, useRuntimeConfig } from '#imports'

/**
 * Locale-aware links to the admin pages. Always use these instead of building the path by hand: they keep the locale
 * prefix and follow `faq.settings.pages.admin`.
 */
export function useFaqLinks() {
  const { localize } = useLocaleLink()
  const pages = useRuntimeConfig().public.faq?.pages
  const admin = pages?.admin || '/admin/faq'
  const adminGroup = pages?.adminGroup || `${admin}/:id`
  return {
    admin: () => localize(admin),
    adminGroup: (id: string) => localize(adminGroup.replace(':id', encodeURIComponent(id))),
  }
}
