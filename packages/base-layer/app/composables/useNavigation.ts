export const useNavigation = (tags?: string[]) => {
  // Resolved in setup: calling a composable inside the handler, after an await, loses the Nuxt context.
  const config = useConfig()

  return useAsyncData(
    () => `navigation:${tags?.join(',') || 'all'}`,
    async () => {
      const { data } = await config
      const navigation = data.value?.navigation || []
      if (!tags) return navigation
      return navigation.filter(item => tags.some(tag => item?.tags?.includes(tag)))
    },
  )
}
