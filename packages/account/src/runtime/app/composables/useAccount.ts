export const useAccount = () => {
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function withRequest<T>(request: () => Promise<T>, fallbackMessage: string): Promise<T> {
    pending.value = true
    error.value = null

    try {
      const result = await request()
      await useUserSession().fetch()
      return result
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : fallbackMessage
      throw err
    }
    finally {
      pending.value = false
    }
  }

  function updateProfileDetails(payload: { name: string, avatar?: string }) {
    return withRequest(
      () => $fetch('/api/account/profile', { method: 'POST', body: payload }),
      'Failed to update your profile.',
    )
  }

  function updateColorMode(payload: { colorMode: 'light' | 'dark' | 'system' }) {
    return withRequest(
      () => $fetch('/api/account/color-mode', { method: 'POST', body: payload }),
      'Failed to update your color mode.',
    )
  }

  function changeEmailAddress(payload: { email: string }) {
    return withRequest(
      () => $fetch('/api/account/change-email', { method: 'POST', body: payload }),
      'Failed to change your email address.',
    )
  }

  function changePassword(payload: { currentPassword: string, newPassword: string, confirmNewPassword: string }) {
    return withRequest(
      () => $fetch('/api/account/change-password', { method: 'POST', body: payload }),
      'Failed to change your password.',
    )
  }

  return { updateProfileDetails, updateColorMode, changeEmailAddress, changePassword, pending, error }
}
