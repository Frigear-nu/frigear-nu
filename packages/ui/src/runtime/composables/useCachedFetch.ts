import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import type { AsyncData, AsyncDataHandlerContext, AsyncDataOptions, NuxtApp, NuxtError, UseFetchOptions } from 'nuxt/app'
import {
  type CachedFetchStorage,
  type CachedFetchStorageOptions,
  flushPersistence,
  getScope,
  hasPersistence,
  persistEntry,
  readPersisted,
  removePersisted,
  setPersistence,
  setScope,
} from '../shared/cached-fetch-storage'
import { computed, markRaw, toValue, useAsyncData, useFetch, useNuxtApp, useRuntimeConfig, useState } from '#imports'

export type { CachedFetchStorage, CachedFetchStorageOptions } from '../shared/cached-fetch-storage'

/** One remembered response: what `useFetch` produced (after `transform`) and when. */
export interface CachedFetchEntry<T = unknown> {
  at: number
  data: T
  /**
   * Read back from the app's storage at startup (`hydrateCachedFetch`), not fetched in this run of the app. Shown at
   * once, but the first mount always asks the server, whatever the `ttl`.
   */
  restored?: true
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
  /**
   * Whether the response is also written to the app's storage, when it provides one (`provideCachedFetchStorage`, e.g.
   * the mobile app's disk), so it shows at once after the next cold start. Default `true`; `false` for data that should
   * never be written to the device.
   */
  persist?: boolean
  /**
   * In the browser, `await` resolves at once when there is something to show (a stale remembered response, one restored
   * from storage), instead of waiting for the refetch; the data updates when it lands. Default: the app's
   * `runtimeConfig.public.cachedFetch.instant`, which `@frigear-nu/mobile` turns on, else `false`. The server always
   * waits.
   */
  instant?: boolean
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
  const at = Date.now()
  useCachedFetchStore().value[key] = markRaw({ at, data })
  persistEntry(key, at, data)
}

/**
 * Forget remembered responses so the next mount fetches again: one key, the keys a predicate accepts, or all of them,
 * in memory and in the app's storage. The cache is already emptied when the signed-in user changes (sign-in,
 * sign-out); call it when data no longer applies for another reason.
 */
export function clearCachedFetch(keys?: string | string[] | ((key: string) => boolean)) {
  const cache = useCachedFetchStore()
  const drops = keys === undefined
    ? () => true
    : typeof keys === 'function' ? keys : (key: string) => (Array.isArray(keys) ? keys : [keys]).includes(key)
  cache.value = Object.fromEntries(Object.entries(cache.value).filter(([key]) => !drops(key)))
  if (hasPersistence()) void removePersisted(drops)
}

/**
 * Where remembered responses are also written, so they survive a restart of the app: an unstorage `Storage` (any
 * driver) or `null` to stop. Client only, and only in an app that serves one visitor per JavaScript context (a mobile
 * or desktop app): `@frigear-nu/mobile` provides its filesystem storage on a device. Call `hydrateCachedFetch()` right
 * after, before pages set up.
 *
 * Responses are stored per signed-in user (`setCachedFetchOwner`); what another user left behind is deleted.
 */
export function provideCachedFetchStorage(storage: CachedFetchStorage | null, options: CachedFetchStorageOptions = {}) {
  if (import.meta.server) return
  setPersistence(storage, options)
}

/**
 * Fills the in-memory cache with the responses stored for the current user, so the first pages render with them at
 * once. Stored responses are stale: they show at once, and the first mount of each key asks the server in the
 * background whatever its `ttl` (the data may be days old). Ones older than the storage's `maxAge` are deleted
 * instead. A key that already has a response in memory keeps it.
 *
 * Resolves once read, or after `timeout` ms (default `500`) so a slow disk never holds the app's start: what arrives
 * later still fills the keys nothing has fetched yet. Never rejects.
 */
export function hydrateCachedFetch(options: { timeout?: number } = {}): Promise<void> {
  if (import.meta.server || !hasPersistence()) return Promise.resolve()
  // Captured now: the Nuxt context does not survive the `await`.
  const cache = useCachedFetchStore()
  const read = readPersisted().then((entries) => {
    if (!entries.length) return
    const next = { ...cache.value }
    for (const { key, at, data } of entries) next[key] ??= markRaw({ at, data, restored: true as const })
    cache.value = next
  }, () => undefined)
  const timeout = options.timeout ?? 500
  if (timeout <= 0) return read
  return Promise.race([read, new Promise<void>(resolve => setTimeout(resolve, timeout))])
}

/** Writes pending responses to the app's storage now, e.g. when the app goes to the background. */
export function flushCachedFetch(): Promise<void> {
  return flushPersistence()
}

/**
 * Says whose responses the cache holds: `user:<id>` or `guest` (`cachedFetchScopeOf(userId)`). When it changes, the
 * remembered responses are forgotten (they belonged to the previous user), in memory and in storage. `keep: true`
 * only records the owner, for the first call at startup. `@frigear-nu/ui` calls it from the signed-in user of
 * `@frigear-nu/auth`; an app without it stays `guest`.
 */
export function setCachedFetchOwner(owner: string, options: { keep?: boolean } = {}) {
  const cache = useCachedFetchStore()
  // The previous owner's stored responses go with them: `setScope` deletes every other owner's.
  if (setScope(owner) && !options.keep) cache.value = {}
}

/**
 * Where `useCachedFetch` gets data without a request, in this order:
 * 1. while hydrating, the server's response from the payload (and it is remembered for later mounts); on the server,
 *    data primed for this request (`primeCachedFetch`);
 * 2. on a mount (`cause: 'initial'`), the remembered response while it is younger than `ttl` and was fetched in this run
 *    of the app (one restored from storage, `hydrateCachedFetch`, is stale until it is fetched again);
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
  // Read back from storage at startup: shown (through `default`) while the first request of this run is out.
  if (entry.restored) return undefined
  if (ttl !== undefined && now - entry.at >= ttl) return undefined
  return { data: entry.data, remember: false }
}

/**
 * The options `useCachedFetch` and `useCachedAsyncData` give Nuxt, and the result they return: the remembered response
 * as `default` (so a refetch never blanks the screen), `getCachedData` choosing between it and a request
 * (`cachedFetchData`), and `transform` remembering each response.
 */
function cachedDataOptions<ResT, DataT>(
  key: MaybeRefOrGetter<string>,
  options: { ttl?: number, persist?: boolean, transform?: (input: ResT) => DataT | Promise<DataT> },
) {
  const cache = useCachedFetchStore()
  const { ttl, transform, persist = true } = options

  // Whose data this component asks for: a response that lands after the user changed (a request sent before signing
  // out) is shown where it was asked for, but never remembered for the next user.
  const owner = getScope()
  const remember = (name: string, data: unknown) => {
    if (import.meta.server || getScope() !== owner) return
    const at = Date.now()
    cache.value[name] = markRaw({ at, data })
    if (persist) persistEntry(name, at, data)
  }

  return {
    cache,
    nuxtOptions: {
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
    },
  }
}

/** Whether `await` resolves at once with something on screen: the option, else the app's default. */
export function cachedFetchInstant(option: boolean | undefined): boolean {
  if (option !== undefined) return option
  const config = useRuntimeConfig().public as { cachedFetch?: { instant?: boolean } }
  return config.cachedFetch?.instant === true
}

function cachedDataResult<DataT>(
  key: MaybeRefOrGetter<string>,
  cache: Ref<CachedFetchStore>,
  fetched: AsyncData<DataT | undefined, NuxtError | undefined> & Promise<unknown>,
  instant: boolean,
): CachedFetchResult<DataT> & Promise<CachedFetchResult<DataT>> {
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
      if (hasPersistence()) void removePersisted(entry => entry === name)
      fetched.clear()
    },
    loading: computed(() => fetched.status.value === 'pending' && fetched.data.value === undefined),
  }

  // `instant`: with something on screen already (a remembered response being refreshed, one restored from storage),
  // `await` does not wait for the request; the page renders with it and updates when the response lands. Otherwise (and
  // always on the server) it waits for the request, as `useFetch` does.
  const settled = instant && !import.meta.server && fetched.data.value !== undefined ? Promise.resolve() : Promise.resolve(fetched)
  return Object.assign(settled.then(() => result), result)
}

/**
 * `useFetch` whose data survives client navigation (and, with a storage the app provides, a restart of the app) and
 * that is awaitable in pages.
 *
 * Nuxt drops `useFetch` data once the last component using a key unmounts, so going back to a page blanked it and
 * showed the empty state until a refetch landed. `useCachedFetch` remembers each response by `key` (see
 * `cachedFetchData` for the order) and shows the remembered one at once, refetching in the background when it is
 * older than `ttl`.
 *
 * - `data` is `undefined` until the first response; there is no `default`, so a failed request never looks like an
 *   empty result. Check `error` (and `status`) and derive lists with `?? []`.
 * - `loading` is `true` only while nothing is on screen yet: render a skeleton for it, never the empty state.
 * - `await` it in pages so SSR renders with data; in a widget, use it without `await` and render from `loading`. It
 *   waits for a refetch of a stale response, unless `instant` (on in the mobile app), which renders it at once.
 * - The cache belongs to the signed-in user: it is emptied when they sign out or another user signs in.
 *
 * ```ts
 * const { data, error, loading, refresh } = await useCachedFetch<TicketDto[]>('/api/events/me/tickets', {
 *   key: 'events:tickets:mine',
 *   ttl: 60_000,
 * })
 * ```
 */
export function useCachedFetch<ResT, DataT = ResT>(
  request: string | Ref<string> | (() => string),
  options: CachedFetchOptions<ResT, DataT>,
): CachedFetchResult<DataT> & Promise<CachedFetchResult<DataT>> {
  const { key, ttl, persist, instant, transform, ...rest } = options
  const { cache, nuxtOptions } = cachedDataOptions<ResT, DataT>(key, { ttl, persist, transform: transform as ((input: ResT) => DataT | Promise<DataT>) | undefined })

  const fetched = useFetch(request, {
    ...rest,
    key,
    ...nuxtOptions,
  } as UseFetchOptions<ResT, DataT>) as unknown as AsyncData<DataT | undefined, NuxtError | undefined> & Promise<unknown>

  return cachedDataResult(key, cache, fetched, cachedFetchInstant(instant))
}

export type CachedAsyncDataOptions<ResT, DataT = ResT> = Omit<AsyncDataOptions<ResT, DataT>, 'default' | 'getCachedData'> & {
  /** As `useCachedFetch`'s `ttl`: how long (ms) a remembered response is reused on mount. Omitted: until `refresh()`. */
  ttl?: number
  /** As `useCachedFetch`'s `persist`: also written to the app's storage when it provides one. Default `true`. */
  persist?: boolean
  /** As `useCachedFetch`'s `instant`: `await` resolves at once with something on screen. Default: the app's config. */
  instant?: boolean
}

/**
 * `useCachedFetch` for data that is not one `useFetch` request: `useAsyncData` with a handler (several requests, a
 * response worked on before it is shown, `useRequestFetch`), remembered by `key` in the same cache, with the same
 * rules (`ttl`, `persist`, `instant`, `loading`, no `default`, awaitable).
 *
 * ```ts
 * const { data, loading } = await useCachedAsyncData(() => `help-center:faqs:${slugs.value}`, async () => {
 *   const faqs = await $fetch<FaqDto[]>('/api/help-center/faqs')
 *   return { faqs, parts: await partsOf(faqs) }
 * }, { ttl: 5 * 60_000, watch: [slugs] })
 * ```
 */
export function useCachedAsyncData<ResT, DataT = ResT>(
  key: MaybeRefOrGetter<string>,
  handler: (nuxtApp: NuxtApp, ctx: AsyncDataHandlerContext) => Promise<ResT>,
  options: CachedAsyncDataOptions<ResT, DataT> = {},
): CachedFetchResult<DataT> & Promise<CachedFetchResult<DataT>> {
  const { ttl, persist, instant, transform, ...rest } = options
  const { cache, nuxtOptions } = cachedDataOptions<ResT, DataT>(key, { ttl, persist, transform: transform as ((input: ResT) => DataT | Promise<DataT>) | undefined })

  const fetched = useAsyncData(key, handler, {
    ...rest,
    ...nuxtOptions,
  } as AsyncDataOptions<ResT, DataT>) as unknown as AsyncData<DataT | undefined, NuxtError | undefined> & Promise<unknown>

  return cachedDataResult(key, cache, fetched, cachedFetchInstant(instant))
}
