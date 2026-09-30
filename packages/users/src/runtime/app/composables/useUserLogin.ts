import type { ButtonProps } from '@nuxt/ui'

export const useUserLogin = () => {
  const isEnabled = computed(() => {
    return Boolean(useRuntimeConfig().public.users.login)
  })

  // Icons/name/link e.g i-lucide-google + Google + /auth/google or /auth/auth0
  const oauthProviders = computed<ButtonProps[]>(() => [
    { title: 'Google', icon: 'i-lucide-google', to: '/auth/google' },
  ])

  const passkeyLoginEnabled = computed(() => {
    return false
  })

  const passwordLoginEnabled = computed(() => {
    return false
  })

  return {
    isEnabled,
    oauthProviders,
    passkeyLoginEnabled,
    passwordLoginEnabled,
  }
}
