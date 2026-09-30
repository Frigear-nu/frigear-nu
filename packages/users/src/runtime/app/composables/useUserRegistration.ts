export const useUserRegistration = () => {
  const isEnabled = computed(() => {
    return Boolean(useRuntimeConfig().public.users.register)
  })

  return {
    isEnabled,
  }
}
