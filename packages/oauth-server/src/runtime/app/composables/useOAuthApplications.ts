import type { AdminApplicationDto, ApplicationInput, CreatedApplicationDto, UserApplicationDto } from '../../../types'

const BASE = '/api/oauth-server'

/** Admin CRUD for applications. Every call needs the host's `oauth:authorize` hook to allow the user. */
export function useOAuthApplications() {
  const { data, status, error, refresh } = useFetch<AdminApplicationDto[]>(`${BASE}/admin/applications`, {
    key: 'oauth-server:applications',
    default: () => [],
  })

  async function create(input: ApplicationInput) {
    const created = await $fetch<CreatedApplicationDto>(`${BASE}/admin/applications`, { method: 'POST', body: input })
    await refresh()
    return created
  }

  async function update(id: string, patch: Partial<ApplicationInput>) {
    const updated = await $fetch<AdminApplicationDto>(`${BASE}/admin/applications/${id}`, { method: 'PATCH', body: patch })
    await refresh()
    return updated
  }

  async function remove(id: string) {
    await $fetch(`${BASE}/admin/applications/${id}`, { method: 'DELETE' })
    await refresh()
  }

  /** Returns the new client secret; the old one stops working. */
  async function rotateSecret(id: string) {
    const { clientSecret } = await $fetch<{ clientSecret: string }>(`${BASE}/admin/applications/${id}/secret`, { method: 'POST' })
    await refresh()
    return clientSecret
  }

  async function revokeGrants(id: string) {
    await $fetch(`${BASE}/admin/applications/${id}/revoke`, { method: 'POST' })
    await refresh()
  }

  return { applications: data, status, error, refresh, create, update, remove, rotateSecret, revokeGrants }
}

/** The applications the signed-in user may sign in to. */
export function useMyApplications() {
  const { loggedIn } = useUserSession()
  const { data, status, refresh } = useFetch<UserApplicationDto[]>(`${BASE}/me/applications`, {
    key: 'oauth-server:mine',
    immediate: loggedIn.value,
    watch: false,
    default: () => [],
  })
  return { applications: data, status, refresh }
}
