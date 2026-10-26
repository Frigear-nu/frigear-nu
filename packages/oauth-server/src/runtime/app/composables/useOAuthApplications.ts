import type { AdminApplicationDto, ApplicationInput, CreatedApplicationDto, UserApplicationDto } from '../../../types'

const BASE = '/api/oauth-server'

// Aliased so the `<Admin` deprecated-component grep gate does not match the generics below.
type Application = AdminApplicationDto

/** The `useFetch` key of the admin list; `refreshNuxtData(OAUTH_APPLICATIONS_KEY)` reloads it from anywhere. */
export const OAUTH_APPLICATIONS_KEY = 'oauth-server:applications'

/** The admin endpoints as plain calls (no refresh). Every call needs the host's `oauth:authorize` hook to allow the user. */
export const oauthApplicationsApi = {
  create: (input: ApplicationInput) =>
    $fetch<CreatedApplicationDto>(`${BASE}/admin/applications`, { method: 'POST', body: input }),
  update: (id: string, patch: Partial<ApplicationInput>) =>
    $fetch<Application>(`${BASE}/admin/applications/${id}`, { method: 'PATCH', body: patch }),
  remove: (id: string) =>
    $fetch(`${BASE}/admin/applications/${id}`, { method: 'DELETE' }),
  /** Returns the new client secret; the old one stops working. */
  rotateSecret: async (id: string) =>
    (await $fetch<{ clientSecret: string }>(`${BASE}/admin/applications/${id}/secret`, { method: 'POST' })).clientSecret,
  revokeGrants: (id: string) =>
    $fetch(`${BASE}/admin/applications/${id}/revoke`, { method: 'POST' }),
}

/** Admin CRUD for applications. Every call needs the host's `oauth:authorize` hook to allow the user. */
export function useOAuthApplications() {
  const { data, status, error, refresh } = useFetch<Application[]>(`${BASE}/admin/applications`, {
    key: OAUTH_APPLICATIONS_KEY,
    default: () => [],
  })

  async function create(input: ApplicationInput) {
    const created = await oauthApplicationsApi.create(input)
    await refresh()
    return created
  }

  async function update(id: string, patch: Partial<ApplicationInput>) {
    const updated = await oauthApplicationsApi.update(id, patch)
    await refresh()
    return updated
  }

  async function remove(id: string) {
    await oauthApplicationsApi.remove(id)
    await refresh()
  }

  /** Returns the new client secret; the old one stops working. */
  async function rotateSecret(id: string) {
    const clientSecret = await oauthApplicationsApi.rotateSecret(id)
    await refresh()
    return clientSecret
  }

  async function revokeGrants(id: string) {
    await oauthApplicationsApi.revokeGrants(id)
    await refresh()
  }

  return { applications: data, status, error, refresh, create, update, remove, rotateSecret, revokeGrants }
}

/**
 * The applications the signed-in user may sign in to. Awaitable: `await useMyApplications()` in a page renders them on
 * the server. `applications` is `[]` until loaded and after an error: check `loading` and `error` first.
 */
export function useMyApplications() {
  const { loggedIn } = useUserSession()
  // The server knows the visitor from the request's cookie, so the request does not wait for the client-side session.
  const fetched = useCachedFetch<UserApplicationDto[]>(`${BASE}/me/applications`, {
    key: 'oauth-server:mine',
    ttl: 5 * 60 * 1000,
    watch: false,
  })
  const { status, error, loading, refresh, clear } = fetched

  watch(loggedIn, (value) => {
    if (value) refresh()
    else clear()
  })

  const applications = computed(() => fetched.data.value ?? [])
  const api = { applications, status, error, loading, refresh }
  return Object.assign(fetched.then(() => api), api)
}
