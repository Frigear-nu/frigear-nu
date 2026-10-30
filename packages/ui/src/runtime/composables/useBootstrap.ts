import { clearCachedFetch, primeCachedFetch } from './useCachedFetch'
import { $fetch, useNuxtApp, useRequestFetch, useState } from '#imports'

/** What the app knows about an area's last bootstrap: when it loaded and which keys it primed. */
export interface BootstrapState {
  at: number
  keys: string[]
}

export interface LoadBootstrapOptions {
  /**
   * How long (ms) a bootstrap counts as fresh: entering the area again within it makes no request. Keep it at or
   * below the `ttl` of the composables it primes, so they always find their entry fresh. Default one minute.
   */
  ttl?: number
}

export const BOOTSTRAP_TTL_MS = 60 * 1000

// `authApi.bootstrap` of `@frigear-nu/auth`, which `ui` does not depend on.
const BOOTSTRAP_URL = '/api/auth/bootstrap'

const stateKey = (scope: string) => `ui:bootstrap:${scope}`
const inFlight = new Map<string, Promise<void>>()

/** The last bootstrap of `scope` (`null` before the first, after `resetBootstrap` or when it failed). */
export const useBootstrapState = (scope: string) => useState<BootstrapState | null>(stateKey(scope), () => null)

/**
 * Load an area's user-scoped data in one request (`GET /api/auth/bootstrap?scope=<scope>`, served by `@frigear-nu/auth`)
 * and prime the `useCachedFetch` entry of every key it returns, so the modules' composables (`useMyTickets()`,
 * `useSubscription()`, ...) render without a request of their own. Call it from a route middleware of the area: it
 * runs before the page's components set up, on the server and on every client navigation.
 *
 * - Server: the data goes into the payload, used by the server render and by hydration.
 * - Hydration: the payload entries are remembered for later navigation; nothing is fetched.
 * - Client navigation: fetches again only when the last bootstrap is older than `ttl`.
 *
 * Never throws: when the request fails (or leaves a key out) the composables fetch from their own endpoints.
 */
export async function loadBootstrap(scope: string, options: LoadBootstrapOptions = {}): Promise<void> {
  const nuxtApp = useNuxtApp()
  const state = useBootstrapState(scope)
  const ttl = options.ttl ?? BOOTSTRAP_TTL_MS

  if (import.meta.client) {
    if (nuxtApp.isHydrating && nuxtApp.payload.serverRendered) {
      // The server loaded it for this page: remember what it put in the payload, for the pages visited next.
      if (!state.value) return
      for (const key of state.value.keys) {
        const data = nuxtApp.payload.data[key]
        if (data !== undefined) primeCachedFetch(key, data)
      }
      state.value = { ...state.value, at: Date.now() }
      return
    }
    if (state.value && Date.now() - state.value.at < ttl) return
    const pending = inFlight.get(scope)
    if (pending) return pending
  }

  const run = async () => {
    try {
      // On the server `useRequestFetch` forwards the visitor's cookie and calls the route in-process.
      const fetcher = import.meta.server ? useRequestFetch() : $fetch
      const data = await fetcher<Record<string, unknown>>(BOOTSTRAP_URL, { query: { scope } })
      // The Nuxt context does not survive the `await`; `primeCachedFetch` needs it.
      nuxtApp.runWithContext(() => {
        for (const [key, value] of Object.entries(data)) primeCachedFetch(key, value)
      })
      state.value = { at: Date.now(), keys: Object.keys(data) }
    }
    catch (error) {
      if (import.meta.dev) console.warn(`[ui] bootstrap "${scope}" failed, the pages load their own data:`, error)
    }
  }

  if (import.meta.server) return run()
  const promise = run().finally(() => inFlight.delete(scope))
  inFlight.set(scope, promise)
  return promise
}

/**
 * Forget an area's bootstrap and the cache entries it primed, so the next visit loads them again. Call it when the
 * data no longer belongs to the visitor (signing in or out).
 */
export function resetBootstrap(scope: string) {
  const state = useBootstrapState(scope)
  if (state.value?.keys.length) clearCachedFetch(state.value.keys)
  state.value = null
}
