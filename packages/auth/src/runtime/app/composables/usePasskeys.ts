export interface UserPasskey {
  id: string
  userId: number
  counter: number
  backedUp: boolean
  transports: string[] | null
  name: string | null
  createdAt: string | Date
}

export const usePasskeys = () => {
  const config = useRuntimeConfig().public.authentication

  const isEnabled = computed(() => config?.webAuthn === true)

  const { register, authenticate } = useWebAuthn({
    registerEndpoint: '/api/auth/webauthn/register',
    authenticateEndpoint: '/api/auth/webauthn/authenticate',
  })
  const { fetch: fetchUserSession } = useUserSession()

  async function registerPasskey(userName: string, name?: string) {
    await register({ userName, displayName: name?.trim() || undefined }).then(fetchUserSession)
  }

  async function authenticateWithPasskey(userName?: string) {
    await authenticate(userName).then(fetchUserSession)
  }

  function listPasskeys() {
    return $fetch<UserPasskey[]>('/api/auth/webauthn/credentials')
  }

  function removePasskey(id: string) {
    return $fetch(`/api/auth/webauthn/credentials/${id}`, { method: 'DELETE' })
  }

  return { isEnabled, registerPasskey, authenticateWithPasskey, listPasskeys, removePasskey }
}
