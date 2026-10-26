/**
 * Whether the current route can be a content page. Routes a module registers through `addModulePages` carry
 * `meta.moduleName` and are never served from `@nuxt/content` (account, admin, auth, ...); any other page can opt out
 * with `definePageMeta({ content: false })`. Skipping them avoids a content query (and, in the browser, loading the
 * WASM SQLite dump behind it) on every navigation inside those areas.
 */
export const routeServedByContent = (meta: Record<string, unknown>) =>
  meta.content !== false && !meta.moduleName

export const useCurrentPage = () => {
  const route = useRoute()
  const { locale, stripLocalePrefix } = useContentLocale()
  const collection = computed(() => localizedCollectionName('pages', locale.value))
  const path = computed(() => stripLocalePrefix(route.path))

  return useAsyncData(
    () => `current-page:${collection.value}:${path.value}`,
    // Locale-suffixed collections (e.g. `pages_no`) share the same schema as
    // `pages`, so the cast keeps the return type stable across locales.
    () => routeServedByContent(route.meta)
      ? queryCollection(collection.value as 'pages').path(path.value).first()
      : Promise.resolve(null),
    {
      watch: [path, locale, collection],
      dedupe: 'cancel',
      // Content is static, so a path that was already loaded (revisit) reuses its payload entry instead of querying
      // again. Only an explicit refresh asks the content database.
      getCachedData: (key, nuxtApp, ctx) =>
        ctx.cause === 'refresh:manual' ? undefined : (nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]),
    },
  )
}
