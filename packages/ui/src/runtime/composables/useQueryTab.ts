import { computed, useRoute, useRouter } from '#imports'

export interface QueryTabOptions {
  /** The query parameter that holds the tab. */
  key?: string
}

/**
 * The active tab of a page, kept in the URL (`?tab=`) so a tab can be linked, survives a reload and is restored
 * when the user comes back with the browser's Back button. The first value is the default and is left out of the
 * URL; an unknown value falls back to it. Changing the tab replaces the history entry (no new one per click) and
 * drops `page`, since a list's page does not carry over between tabs. Bind it to `PageTabs`' `v-model`.
 *
 * ```ts
 * const tab = useQueryTab(['builder', 'responses', 'settings'] as const)
 * ```
 */
export function useQueryTab<T extends string>(values: readonly [T, ...T[]], options: QueryTabOptions = {}) {
  const key = options.key ?? 'tab'
  const route = useRoute()
  const router = useRouter()
  return computed<T>({
    get: () => values.includes(route.query[key] as T) ? route.query[key] as T : values[0],
    set: (tab) => {
      const { [key]: _tab, page: _page, ...query } = route.query
      router.replace({ path: route.path, hash: route.hash, query: tab === values[0] ? query : { ...query, [key]: tab } })
    },
  })
}
