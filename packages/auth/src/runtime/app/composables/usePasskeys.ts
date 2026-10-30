import type { AuthPasskeyDto } from '../../../types'
import { authApi } from '../../utils/api'
import { $fetch, computed, useRuntimeConfig, useUserSession } from '#imports'
import { useWebAuthn } from '#auth/webauthn'

/** A passkey of the signed-in user, as `GET /api/auth/me/passkeys` returns it. */
export type UserPasskey = AuthPasskeyDto

export const usePasskeys = () => {
  const config = useRuntimeConfig().public.authentication

  const isEnabled = computed(() => config?.webAuthn === true)

  const { register, authenticate } = useWebAuthn({
    registerEndpoint: authApi.webauthn.register,
    authenticateEndpoint: authApi.webauthn.authenticate,
  })
  const { fetch: fetchUserSession } = useUserSession()

  async function registerPasskey(userName: string, name?: string) {
    await register({ userName, displayName: name?.trim() || undefined }).then(fetchUserSession)
  }

  async function authenticateWithPasskey(userName?: string) {
    await authenticate(userName).then(fetchUserSession)
  }

  function listPasskeys() {
    return $fetch<UserPasskey[]>(authApi.me.passkeys)
  }

  async function removePasskey(id: string) {
    await $fetch(authApi.me.passkey(id), { method: 'DELETE' })
  }

  return { isEnabled, registerPasskey, authenticateWithPasskey, listPasskeys, removePasskey }
}
