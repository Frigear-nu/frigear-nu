export const useCurrentPage = () => {
  const route = useRoute()
  const { locale, stripLocalePrefix } = useContentLocale()
  const collection = computed(() => localizedCollectionName('pages', locale.value))
  const path = computed(() => stripLocalePrefix(route.path))

  return useAsyncData(
    () => `current-page:${collection.value}:${path.value}`,
    // Locale-suffixed collections (e.g. `pages_no`) share the same schema as
    // `pages`, so the cast keeps the return type stable across locales.
    () => queryCollection(collection.value as 'pages').path(path.value).first(),
    {
      watch: [path, locale, collection],
      dedupe: 'cancel',
    },
  )
}
