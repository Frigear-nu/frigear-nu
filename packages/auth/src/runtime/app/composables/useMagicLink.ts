import { authApi } from '../../utils/api'
import { $fetch, computed, ref, useRuntimeConfig } from '#imports'

export const useMagicLink = () => {
  const config = useRuntimeConfig().public.authentication

  const isEnabled = computed(() => config?.magicLink === true)

  const pending = ref(false)
  const error = ref<string | null>(null)

  /** Emails a sign-in link. Resolves the same way whether or not the address has an account. */
  async function sendMagicLink(payload: { email: string, name?: string, redirect?: string }) {
    pending.value = true
    error.value = null

    try {
      await $fetch(authApi.magicLink, { method: 'POST', body: payload })
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to send the link.'
      throw err
    }
    finally {
      pending.value = false
    }
  }

  return { sendMagicLink, pending, error, isEnabled }
}
