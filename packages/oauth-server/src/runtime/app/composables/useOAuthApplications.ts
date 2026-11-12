import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { AsyncData, NuxtError } from 'nuxt/app'
import type { AdminApplicationDto, AdminApplicationsPage, ApplicationInput, CreatedApplicationDto, UserApplicationDto } from '../../../types'
import { oauthServerApi } from '../../utils/api'
import { $fetch, computed, useCachedFetch, useFetch, useUserSession, watch } from '#imports'

type Application = AdminApplicationDto

/** The `useFetch` key of the admin list; `refreshNuxtData(OAUTH_APPLICATIONS_KEY)` reloads it from anywhere. */
export const OAUTH_APPLICATIONS_KEY = 'oauth-server:applications'

/** The admin endpoints as plain calls (no refresh). Every call needs the `oauth:manage` permission. */
export const oauthApplicationsApi = {
  get: (id: string) =>
    $fetch<Application>(oauthServerApi.admin.application(id)),
  create: (input: ApplicationInput) =>
    $fetch<CreatedApplicationDto>(oauthServerApi.admin.applications, { method: 'POST', body: input }),
  update: (id: string, patch: Partial<ApplicationInput>) =>
    $fetch<Application>(oauthServerApi.admin.application(id), { method: 'PATCH', body: patch }),
  /** 204: resolves with `null`. */
  remove: async (id: string): Promise<null> => {
    await $fetch(oauthServerApi.admin.application(id), { method: 'DELETE' })
    return null
  },
  /** Returns the new client secret; the old one stops working. */
  rotateSecret: async (id: string) =>
    (await $fetch<{ clientSecret: string }>(oauthServerApi.admin.rotateSecret(id), { method: 'POST' })).clientSecret,
  /** Signs everyone out of the application; resolves with the application. */
  revokeGrants: (id: string) =>
    $fetch<Application>(oauthServerApi.admin.revoke(id), { method: 'POST' }),
}

/** The list query: `page`, `pageSize`, `q` (name or client id), `sort` (`createdAt`, `name`, `priority`) and `order`. */
export type OAuthApplicationsQuery = Record<string, string | number | undefined>

type ApplicationsAsyncData = Awaited<AsyncData<AdminApplicationsPage | undefined, NuxtError | undefined>>

/** What `useOAuthApplications` returns (and resolves with when awaited). */
export interface OAuthApplicationsState {
  applications: ComputedRef<Application[]>
  total: ComputedRef<number>
  data: ApplicationsAsyncData['data']
  status: ApplicationsAsyncData['status']
  error: ApplicationsAsyncData['error']
  loading: ComputedRef<boolean>
  refreshing: ComputedRef<boolean>
  refresh: ApplicationsAsyncData['refresh']
  create: (input: ApplicationInput) => Promise<CreatedApplicationDto>
  update: (id: string, patch: Partial<ApplicationInput>) => Promise<Application>
  remove: (id: string) => Promise<null>
  rotateSecret: (id: string) => Promise<string>
  revokeGrants: (id: string) => Promise<Application>
}

/**
 * Admin CRUD for applications, with one page of the list. Awaitable: `await useOAuthApplications(query)` in a page
 * renders the list on the server; pass `useTableQuery().query` to page, search and sort it. `applications` is `[]`
 * until loaded and after an error: check `loading` and `error` first. Every call needs the `oauth:manage`
 * permission.
 */
export function useOAuthApplications(
  query: MaybeRefOrGetter<OAuthApplicationsQuery> = {},
): OAuthApplicationsState & Promise<OAuthApplicationsState> {
  const fetched = useFetch<AdminApplicationsPage>(oauthServerApi.admin.applications, { key: OAUTH_APPLICATIONS_KEY, query })
  const { data, status, error, refresh } = fetched
  const applications = computed(() => data.value?.items ?? [])
  const total = computed(() => data.value?.total ?? 0)
  // `loading` is the first load (nothing to show yet); `refreshing` every load after that (rows stay, dimmed).
  const loading = computed(() => status.value === 'pending' && !data.value)
  const refreshing = computed(() => status.value === 'pending' && !!data.value)

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
    return null
  }

  /** Returns the new client secret; the old one stops working. */
  async function rotateSecret(id: string) {
    const clientSecret = await oauthApplicationsApi.rotateSecret(id)
    await refresh()
    return clientSecret
  }

  async function revokeGrants(id: string) {
    const application = await oauthApplicationsApi.revokeGrants(id)
    await refresh()
    return application
  }

  const api: OAuthApplicationsState = { applications, total, data, status, error, loading, refreshing, refresh, create, update, remove, rotateSecret, revokeGrants }
  return Object.assign(fetched.then(() => api), api)
}

/**
 * The applications the signed-in user may sign in to. Awaitable: `await useMyApplications()` in a page renders them on
 * the server. `applications` is `[]` until loaded and after an error: check `loading` and `error` first.
 */
export function useMyApplications() {
  const { loggedIn } = useUserSession()
  // The server knows the visitor from the request's cookie, so the request does not wait for the client-side session.
  const fetched = useCachedFetch<UserApplicationDto[]>(oauthServerApi.me.applications, {
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
