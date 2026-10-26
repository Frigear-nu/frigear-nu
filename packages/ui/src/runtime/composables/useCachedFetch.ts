import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import type { AsyncData, NuxtApp, NuxtError, UseFetchOptions } from 'nuxt/app'

/** One remembered response: what `useFetch` produced (after `transform`) and when. */
export interface CachedFetchEntry<T = unknown> {
  at: number
  data: T
}

export type CachedFetchStore = Record<string, CachedFetchEntry>

export type CachedFetchOptions<ResT, DataT = ResT> = Omit<UseFetchOptions<ResT, DataT>, 'key' | 'default' | 'getCachedData'> & {
  /** The fetch key. Required: it names the cache entry, so composables that share data must share the key. */
  key: MaybeRefOrGetter<string>
  /**
   * How long (ms) a remembered response is reused when a component mounts again (client navigation) without asking
   * the server. Leave it out to reuse it until `refresh()`; `0` always refetches. Either way the remembered response
   * stays on screen while the new one loads.
   */
  ttl?: number
}

export type CachedFetchResult<DataT> = Omit<Awaited<AsyncData<DataT | undefined, NuxtError | undefined>>, 'pending'> & {
  /**
   * `true` only while there is nothing to show yet: the first load of this key. Background refreshes (a stale cache,
   * `refresh()`) keep the last data on screen and leave it `false`. Named `loading` so it does not shadow Nuxt's
   * deprecated `pending` (which is `status === 'pending'`).
   */
  loading: ComputedRef<boolean>
}

const STATE_KEY = 'ui:cached-fetch'

/** The shared, per-app cache behind `useCachedFetch`. Only the client writes to it, so it adds nothing to the payload. */
export const useCachedFetchStore = (): Ref<CachedFetchStore> => useState<CachedFetchStore>(STATE_KEY, () => ({}))

/**
 * Remember a response for `key` as if `useCachedFetch` had fetched it, e.g. data loaded ahead of time (a warm-up, an
 * aggregated request such as `loadBootstrap`). `data` must have the shape the composable's `transform` produces.
 *
 * On the server it goes into this request's payload under `key`, where `useCachedFetch` finds it during server
 * rendering (no request of its own) and the client finds it while hydrating. Prime before the components using
 * `key` set up (a route middleware), so they see it.
 */
export function primeCachedFetch<T>(key: string, data: T) {
  if (import.meta.server) {
    useNuxtApp().payload.data[key] = data
    return
  }
  useCachedFetchStore().value[key] = markRaw({ at: Date.now(), data })
}

/**
 * Forget remembered responses so the next mount fetches again: one key, the keys a predicate accepts, or all of them.
 * Call it when the data no longer belongs to the visitor (signing out).
 */
export function clearCachedFetch(keys?: string | string[] | ((key: string) => boolean)) {
  const cache = useCachedFetchStore()
  const drops = keys === undefined
    ? () => true
    : typeof keys === 'function' ? keys : (key: string) => (Array.isArray(keys) ? keys : [keys]).includes(key)
  cache.value = Object.fromEntries(Object.entries(cache.value).filter(([key]) => !drops(key)))
}

/**
 * Where `useCachedFetch` gets data without a request, in this order:
 * 1. while hydrating, the server's response from the payload (and it is remembered for later mounts); on the server,
 *    data primed for this request (`primeCachedFetch`);
 * 2. on a mount (`cause: 'initial'`), the remembered response while it is younger than `ttl`;
 * 3. otherwise nothing, so `useFetch` fetches. Refreshes (`refresh()`, `refreshNuxtData`, watchers) always fetch.
 *
 * Exported for tests; use `useCachedFetch`.
 */
export function cachedFetchData(
  key: string,
  nuxtApp: Pick<NuxtApp, 'isHydrating' | 'payload'>,
  cause: string,
  cache: CachedFetchStore,
  ttl: number | undefined,
  now = Date.now(),
  server = !!import.meta.server,
): { data: unknown, remember: boolean } | undefined {
  if ((nuxtApp.isHydrating || (server && cause === 'initial')) && nuxtApp.payload.data[key] !== undefined) {
    return { data: nuxtApp.payload.data[key], remember: true }
  }
  if (cause !== 'initial') return undefined
  const entry = cache[key]
  if (!entry) return undefined
  if (ttl !== undefined && now - entry.at >= ttl) return undefined
  return { data: entry.data, remember: false }
}

/**
 * `useFetch` whose data survives client navigation and that is awaitable in pages.
 *
 * Nuxt drops `useFetch` data once the last component using a key unmounts, so going back to a page blanked it and
 * showed the empty state until a refetch landed. `useCachedFetch` remembers each response by `key` (see
 * `cachedFetchData` for the order) and shows the remembered one at once, refetching in the background when it is
 * older than `ttl`.
 *
 * - `data` is `undefined` until the first response; there is no `default`, so a failed request never looks like an
 *   empty result. Check `error` (and `status`) and derive lists with `?? []`.
 * - `loading` is `true` only while nothing is on screen yet: render a skeleton for it, never the empty state.
 * - `await` it in pages so SSR renders with data; in a widget, use it without `await` and render from `loading`.
 *
 * ```ts
 * const { data, error, loading, refresh } = await useCachedFetch<TicketDto[]>('/api/events/tickets/me', {
 *   key: 'events:tickets:mine',
 *   ttl: 60_000,
 * })
 * ```
 */
export function useCachedFetch<ResT, DataT = ResT>(
  request: string | Ref<string> | (() => string),
  options: CachedFetchOptions<ResT, DataT>,
): CachedFetchResult<DataT> & Promise<CachedFetchResult<DataT>> {
  const cache = useCachedFetchStore()
  const { key, ttl, transform, ...rest } = options

  const remember = (name: string, data: unknown) => {
    if (!import.meta.server) cache.value[name] = markRaw({ at: Date.now(), data })
  }

  const fetched = useFetch(request, {
    ...rest,
    key,
    // No caller default: the remembered (possibly stale) response, so a refetch never blanks the screen, or nothing.
    default: () => cache.value[toValue(key)]?.data as DataT | undefined,
    getCachedData: (name: string, nuxtApp: NuxtApp, ctx: { cause: string }) => {
      const hit = cachedFetchData(name, nuxtApp, ctx.cause, cache.value, ttl)
      if (hit?.remember) remember(name, hit.data)
      return hit?.data as DataT | undefined
    },
    transform: async (input: ResT) => {
      const output = transform ? await transform(input) : input
      remember(toValue(key), output)
      return output as DataT
    },
  } as UseFetchOptions<ResT, DataT>) as unknown as AsyncData<DataT | undefined, NuxtError | undefined> & Promise<unknown>

  const result: CachedFetchResult<DataT> = {
    data: fetched.data,
    status: fetched.status,
    error: fetched.error,
    refresh: fetched.refresh,
    execute: fetched.execute,
    clear: () => {
      // `cache` was captured during setup, so this also works outside the component context (e.g. in a watcher).
      const name = toValue(key)
      cache.value = Object.fromEntries(Object.entries(cache.value).filter(([entry]) => entry !== name))
      fetched.clear()
    },
    loading: computed(() => fetched.status.value === 'pending' && fetched.data.value === undefined),
  }

  return Object.assign(Promise.resolve(fetched).then(() => result), result)
}
