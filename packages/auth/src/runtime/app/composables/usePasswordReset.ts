import { authApi } from '../../utils/api'

export const usePasswordReset = () => {
  const config = useRuntimeConfig().public.authentication

  const isEnabled = computed(() => config?.passwordReset === true)

  const pending = ref(false)
  const error = ref<string | null>(null)

  async function requestReset(payload: { email: string }) {
    pending.value = true
    error.value = null

    try {
      await $fetch(authApi.forgotPassword, { method: 'POST', body: payload })
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to request a password reset.'
      throw err
    }
    finally {
      pending.value = false
    }
  }

  async function resetPassword(payload: { code: string, password: string, confirmPassword: string }) {
    pending.value = true
    error.value = null

    try {
      await $fetch(authApi.resetPassword, { method: 'POST', body: payload })
      await useUserSession().fetch()
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to reset password.'
      throw err
    }
    finally {
      pending.value = false
    }
  }

  return { requestReset, resetPassword, pending, error, isEnabled }
}
