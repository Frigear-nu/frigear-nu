import type { AdminOAuthScopeDto, OAuthScopeInput } from '../../../types'
import { oauthServerApi } from '../../utils/api'
import { $fetch, computed, useFetch } from '#imports'

/** The `useFetch` key of the scopes admin list; `refreshNuxtData(OAUTH_SCOPES_KEY)` reloads it from anywhere. */
export const OAUTH_SCOPES_KEY = 'oauth-server:scopes'

/** The scopes admin endpoints as plain calls (no refresh). Every call needs the `oauth:manage` permission. */
export const oauthScopesApi = {
  create: (input: OAuthScopeInput) =>
    $fetch<AdminOAuthScopeDto>(oauthServerApi.admin.scopes, { method: 'POST', body: input }),
  update: (name: string, patch: Partial<Omit<OAuthScopeInput, 'name'>>) =>
    $fetch<AdminOAuthScopeDto>(oauthServerApi.admin.scope(name), { method: 'PATCH', body: patch }),
  /** 204: resolves with `null`. */
  remove: async (name: string): Promise<null> => {
    await $fetch(oauthServerApi.admin.scope(name), { method: 'DELETE' })
    return null
  },
}

/**
 * Every named scope for the admin: the read-only ones of config and modules (`managed`) and the database ones.
 * Awaitable: `await useOAuthScopes()` in a page renders the list on the server.
 */
export function useOAuthScopes() {
  const fetched = useFetch<AdminOAuthScopeDto[]>(oauthServerApi.admin.scopes, { key: OAUTH_SCOPES_KEY })
  const { data, status, error, refresh } = fetched
  const scopes = computed(() => data.value ?? [])
  const loading = computed(() => status.value === 'pending' && !data.value)
  const api = { scopes, data, status, error, loading, refresh }
  return Object.assign(fetched.then(() => api), api)
}
