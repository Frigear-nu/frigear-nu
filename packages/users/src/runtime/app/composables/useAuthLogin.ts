export const useAuthLogin = () => {
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function login(payload: { email: string, password: string }) {
    pending.value = true
    error.value = null

    try {
      await $fetch('/api/auth/login', { method: 'POST', body: payload })
      await useUserSession().fetch()
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to log in.'
      throw err
    }
    finally {
      pending.value = false
    }
  }

  return { login, pending, error }
}
