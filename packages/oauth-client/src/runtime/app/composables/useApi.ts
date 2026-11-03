import { useFetch, useNuxtApp } from '#imports'
import type { UseFetchOptions } from '#app'
import type { MaybeRefOrGetter } from 'vue'
import type { OAuthApi } from '../plugins/api'

/**
 * `useFetch` through `$api` (bearer token, one refresh on 401). Runs on the client only by default (`server: false`),
 * since the tokens live in the browser.
 */
export function useApi<T = unknown>(url: MaybeRefOrGetter<string>, options: UseFetchOptions<T> = {}): ReturnType<typeof useFetch<T>> {
  const { $api } = useNuxtApp() as unknown as { $api: OAuthApi }
  const fetchWith = useFetch as unknown as (url: MaybeRefOrGetter<string>, options: UseFetchOptions<T>) => ReturnType<typeof useFetch<T>>
  return fetchWith(url, { server: false, ...options, $fetch: $api as UseFetchOptions<T>['$fetch'] })
}
