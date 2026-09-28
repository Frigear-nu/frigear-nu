export const useNavigation = (tags?: string[]) => {
  return useAsyncData(
    () => `navigation:${tags?.join(',') || 'all'}`,
    async () => {
      const { data: config } = await useConfig() // or however you access the pending promise
      if (!tags) {
        return config.value?.navigation || []
      }
      return (config.value?.navigation || [])
        .filter(item => !tags || tags.some(tag => item?.tags?.includes(tag)))
    },
  )
}
