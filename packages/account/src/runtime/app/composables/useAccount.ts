import { usersApi } from '@frigear-nu/users/api'
import type { ProfileDto } from '@frigear-nu/users/api'
import { $fetch, ref, useUserSession } from '#imports'

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

  /** `avatar: null` clears the avatar; leaving it out keeps it. */
  function updateProfileDetails(payload: { name?: string, avatar?: string | null }) {
    return withRequest(
      () => $fetch<ProfileDto>(usersApi.me.profile, { method: 'PATCH', body: payload }),
      'Failed to update your profile.',
    )
  }

  function changeEmailAddress(payload: { email: string }) {
    return withRequest(
      () => $fetch<ProfileDto & { verificationRequired: boolean }>(usersApi.me.email, { method: 'PUT', body: payload }),
      'Failed to change your email address.',
    )
  }

  function changePassword(payload: { currentPassword: string, newPassword: string, confirmNewPassword: string }) {
    return withRequest(
      () => $fetch<ProfileDto>(usersApi.me.password, { method: 'PUT', body: payload }),
      'Failed to change your password.',
    )
  }

  return { updateProfileDetails, changeEmailAddress, changePassword, pending, error }
}
