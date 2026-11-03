import { useFetch, useNuxtApp } from '#imports'
import type { UseFetchOptions } from '#app'
import type { MaybeRefOrGetter } from 'vue'
import type { AuthApi } from '../plugins/api'

/** `useFetch` through `$api`: the session's credentials go to this app's own URLs only. */
export function useApi<T = unknown>(url: MaybeRefOrGetter<string>, options: UseFetchOptions<T> = {}): ReturnType<typeof useFetch<T>> {
  const { $api } = useNuxtApp() as unknown as { $api: AuthApi }
  const fetchWith = useFetch as unknown as (url: MaybeRefOrGetter<string>, options: UseFetchOptions<T>) => ReturnType<typeof useFetch<T>>
  return fetchWith(url, { ...options, $fetch: $api as UseFetchOptions<T>['$fetch'] })
}
