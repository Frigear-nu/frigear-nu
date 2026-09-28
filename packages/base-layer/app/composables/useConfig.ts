export const useConfig = () => {
  const { locale } = useContentLocale()
  const collection = computed(() => localizedCollectionName('config', locale.value))

  return useAsyncData(
    () => `config:${collection.value}`,
    // Locale-suffixed collections (e.g. `config_no`) share the same schema as
    // `config`, so the cast keeps the return type stable across locales.
    () => queryCollection(collection.value as 'config').first(),
    { watch: [locale] },
  )
}
