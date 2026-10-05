export const useUserPasskeys = () => {
  const config = useRuntimeConfig().public.users

  const isEnabled = computed(() => config?.webAuthn === true)

  const { register, authenticate } = useWebAuthn({
    registerEndpoint: '/api/auth/webauthn/register',
    authenticateEndpoint: '/api/auth/webauthn/authenticate',
  })
  const { fetch: fetchUserSession } = useUserSession()

  async function registerPasskey(userName: string) {
    await register({ userName }).then(fetchUserSession)
  }

  async function authenticateWithPasskey(userName?: string) {
    await authenticate(userName).then(fetchUserSession)
  }

  function listPasskeys() {
    return $fetch('/api/auth/webauthn/credentials')
  }

  function removePasskey(id: string) {
    return $fetch(`/api/auth/webauthn/credentials/${id}`, { method: 'DELETE' })
  }

  return { isEnabled, registerPasskey, authenticateWithPasskey, listPasskeys, removePasskey }
}
