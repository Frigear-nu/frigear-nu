import { OAUTH_PROVIDER_META } from '../utils/oauth-providers'

export const useLogin = () => {
  const config = useRuntimeConfig().public.authentication

  const passwordLoginEnabled = computed(() => config?.password === true)
  const passkeyLoginEnabled = computed(() => config?.webAuthn === true)
  // The build time flag cannot see runtime secrets (production), so the server is asked when it says no.
  const { data: frigearStatus } = config?.oauth?.includes('frigear') && config.frigearSso !== true
    ? useFetch<{ enabled: boolean }>('/api/auth/frigear-status', { key: 'auth-frigear-status', default: () => ({ enabled: false }) })
    : { data: ref<{ enabled: boolean } | null>(null) }
  const frigearEnabled = computed(() => config?.frigearSso === true || frigearStatus.value?.enabled === true)
  const oauthProviders = computed(() => (config?.oauth ?? [])
    .filter(provider => provider !== 'frigear' || frigearEnabled.value)
    .map(provider => OAUTH_PROVIDER_META[provider]))
  const isEnabled = computed(() => passwordLoginEnabled.value || passkeyLoginEnabled.value || oauthProviders.value.length > 0)

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

  return { login, pending, error, isEnabled, passwordLoginEnabled, passkeyLoginEnabled, oauthProviders }
}
