import { upperFirst } from 'scule'
import type { OAuthProviderButton } from '../../../types'
import { DEFAULT_OAUTH_ICON, OAUTH_PROVIDER_META } from '../utils/oauth-providers'
import { authApi } from '../../utils/api'
import { $fetch, computed, ref, useFetch, useModuleT, useRuntimeConfig, useUserSession } from '#imports'

export const useLogin = () => {
  const config = useRuntimeConfig().public.authentication
  const t = useModuleT('auth')

  const passwordLoginEnabled = computed(() => config?.password === true)
  const passkeyLoginEnabled = computed(() => config?.webAuthn === true)
  // The server decides per request: providers turn on through their credentials, usually runtime secrets.
  const { data: providerButtons } = useFetch<OAuthProviderButton[]>(authApi.providers, { key: 'auth-oauth-providers', default: () => [] })
  // Structurally a `@nuxt/ui` `ButtonProps`, so each entry can go straight into `UAuthForm`'s `providers`.
  const oauthProviders = computed(() => (providerButtons.value ?? []).map(({ label, icon, ...button }) => ({
    ...button,
    label: label ?? t(`oauth.${button.key}.label`, OAUTH_PROVIDER_META[button.key]?.label ?? upperFirst(button.key)),
    icon: icon ?? OAUTH_PROVIDER_META[button.key]?.icon ?? DEFAULT_OAUTH_ICON,
  })))
  const isEnabled = computed(() => passwordLoginEnabled.value || passkeyLoginEnabled.value || oauthProviders.value.length > 0)

  const pending = ref(false)
  const error = ref<string | null>(null)

  async function login(payload: { email: string, password: string }) {
    pending.value = true
    error.value = null

    try {
      await $fetch(authApi.login, { method: 'POST', body: payload })
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
