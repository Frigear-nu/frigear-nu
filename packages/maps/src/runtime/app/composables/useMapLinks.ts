import { useLocaleLink, useRuntimeConfig } from '#imports'

/**
 * Locale-aware links to the maps pages (the read-only map page, the admin list and the admin map page), following
 * `maps.settings.pages`. Each returns `undefined` when that page is off.
 */
export function useMapLinks() {
  const { localize } = useLocaleLink()
  const pages = useRuntimeConfig().public.maps?.pages ?? {}
  const fill = (path: string | undefined, param: string, value: string) =>
    path ? localize(path.replace(`:${param}`, encodeURIComponent(value))) : undefined

  return {
    /** The read-only page of a map (by key or id), optionally focusing a feature (`?feature=`). */
    view: (map: string, feature?: string) => {
      const path = fill(pages.view, 'map', map)
      return path && feature ? `${path}?feature=${encodeURIComponent(feature)}` : path
    },
    /** The staff map list. */
    admin: () => pages.admin ? localize(pages.admin) : undefined,
    /** The staff page of a map, with the editor. */
    adminMap: (id: string) => fill(pages.adminMap, 'id', id),
  }
}
