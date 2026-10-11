export const useUserRegistration = () => {
  const config = useRuntimeConfig().public.users

  const isEnabled = computed(() => config?.password === true)

  const pending = ref(false)
  const error = ref<string | null>(null)

  async function register(payload: { name: string, email: string, password: string }) {
    pending.value = true
    error.value = null

    try {
      const result = await $fetch<{ id: number, verificationRequired: boolean }>('/api/auth/register', { method: 'POST', body: payload })
      await useUserSession().fetch()
      return result
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to register.'
      throw err
    }
    finally {
      pending.value = false
    }
  }

  return { register, pending, error, isEnabled }
}
