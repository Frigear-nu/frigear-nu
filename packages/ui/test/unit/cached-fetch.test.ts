import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, markRaw, ref, shallowRef, toValue } from 'vue'
import type { Ref } from 'vue'
import { cachedFetchData, clearCachedFetch, primeCachedFetch, useCachedFetch } from '../../src/runtime/composables/useCachedFetch'

// The composable imports its Nuxt helpers from `#imports`: hand it the stubs `fakeNuxt` puts on `globalThis`.
vi.mock('#imports', () => new Proxy({}, { has: () => true, get: (_, key) => (globalThis as Record<PropertyKey, unknown>)[key] }))

type Options = {
  key: string
  default: () => unknown
  getCachedData: (key: string, nuxtApp: unknown, ctx: { cause: string }) => unknown
  transform: (input: unknown) => Promise<unknown>
}

/**
 * A small stand-in for Nuxt's `useFetch`, following what `asyncData.ts` does with the options `useCachedFetch` sets:
 * `getCachedData` on mount (and on refresh), `default` when nothing is cached, `transform` on each response and
 * `default` again when a request fails.
 */
function fakeNuxt() {
  const state: Record<string, Ref<unknown>> = {}
  const nuxtApp = { isHydrating: false, payload: { data: {} as Record<string, unknown> } }
  let respond: (url: string) => Promise<unknown> = async () => []
  const calls: string[] = []

  vi.stubGlobal('useState', (key: string, init: () => unknown) => (state[key] ??= ref(init())))
  vi.stubGlobal('markRaw', markRaw)
  vi.stubGlobal('toValue', toValue)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useFetch', (url: string, options: Options) => {
    const data = shallowRef<unknown>()
    const status = shallowRef('idle')
    const error = shallowRef<unknown>()

    const run = async (cause: string) => {
      const cached = options.getCachedData(options.key, nuxtApp, { cause })
      if (cached !== undefined) {
        data.value = cached
        status.value = 'success'
        return
      }
      status.value = 'pending'
      calls.push(url)
      try {
        data.value = await options.transform(await respond(url))
        error.value = undefined
        status.value = 'success'
      }
      catch (e) {
        error.value = e
        data.value = options.default()
        status.value = 'error'
      }
    }

    const initial = options.getCachedData(options.key, nuxtApp, { cause: 'initial' })
    data.value = initial !== undefined ? initial : options.default()
    const promise = initial !== undefined ? Promise.resolve((status.value = 'success')) : run('initial')
    const asyncData = {
      data,
      status,
      error,
      refresh: () => run('refresh:manual'),
      execute: () => run('refresh:manual'),
      clear: () => { data.value = undefined },
    }
    return Object.assign(promise.then(() => asyncData), asyncData)
  })

  return {
    nuxtApp,
    calls,
    respondWith(fn: (url: string) => Promise<unknown>) {
      respond = fn
    },
  }
}

describe('cachedFetchData', () => {
  const app = (isHydrating = false, data: Record<string, unknown> = {}) => ({ isHydrating, payload: { data } }) as never

  it('prefers the hydration payload and asks to remember it', () => {
    expect(cachedFetchData('k', app(true, { k: [1] }), 'initial', { k: { at: 0, data: [2] } }, 10)).toEqual({ data: [1], remember: true })
  })

  it('reuses a remembered response on mount while it is younger than ttl', () => {
    const cache = { k: { at: 1000, data: [2] } }
    expect(cachedFetchData('k', app(), 'initial', cache, 500, 1400)).toEqual({ data: [2], remember: false })
    expect(cachedFetchData('k', app(), 'initial', cache, 500, 1500)).toBeUndefined()
    expect(cachedFetchData('k', app(), 'initial', cache, undefined, 10_000_000)).toEqual({ data: [2], remember: false })
    expect(cachedFetchData('k', app(), 'initial', cache, 0, 1000)).toBeUndefined()
  })

  it('always fetches on refresh and watch', () => {
    const cache = { k: { at: Date.now(), data: [2] } }
    expect(cachedFetchData('k', app(), 'refresh:manual', cache, undefined)).toBeUndefined()
    expect(cachedFetchData('k', app(), 'refresh:hook', cache, undefined)).toBeUndefined()
    expect(cachedFetchData('k', app(), 'watch', cache, undefined)).toBeUndefined()
  })

  it('fetches when nothing is remembered', () => {
    expect(cachedFetchData('k', app(true, {}), 'initial', {}, undefined)).toBeUndefined()
  })

  it('uses data primed into the payload while rendering on the server, but only on mount', () => {
    const primed = app(false, { k: [3] })
    expect(cachedFetchData('k', primed, 'initial', {}, 0, Date.now(), true)).toEqual({ data: [3], remember: true })
    expect(cachedFetchData('k', primed, 'refresh:manual', {}, 0, Date.now(), true)).toBeUndefined()
    // In the browser the payload is only read while hydrating.
    expect(cachedFetchData('k', primed, 'initial', {}, 0, Date.now(), false)).toBeUndefined()
  })
})

describe('useCachedFetch', () => {
  let nuxt: ReturnType<typeof fakeNuxt>

  beforeEach(() => {
    nuxt = fakeNuxt()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is awaitable and loading only until the first response', async () => {
    nuxt.respondWith(async () => ['a'])
    const pendingResult = useCachedFetch<string[]>('/api/list', { key: 'list' })
    expect(pendingResult.loading.value).toBe(true)
    const { data, loading, status } = await pendingResult
    expect(data.value).toEqual(['a'])
    expect(status.value).toBe('success')
    expect(loading.value).toBe(false)
  })

  it('serves a remount from the cache without a request', async () => {
    nuxt.respondWith(async () => ['a'])
    await useCachedFetch<string[]>('/api/list', { key: 'list' })
    const again = await useCachedFetch<string[]>('/api/list', { key: 'list' })
    expect(again.data.value).toEqual(['a'])
    expect(again.loading.value).toBe(false)
    expect(nuxt.calls).toHaveLength(1)
  })

  it('keeps the stale response on screen while refetching past ttl', async () => {
    nuxt.respondWith(async () => ['a'])
    await useCachedFetch<string[]>('/api/list', { key: 'list', ttl: 0 })
    let release!: (value: unknown) => void
    nuxt.respondWith(() => new Promise((resolve) => {
      release = resolve
    }))
    const again = useCachedFetch<string[]>('/api/list', { key: 'list', ttl: 0 })
    expect(again.status.value).toBe('pending')
    expect(again.data.value).toEqual(['a'])
    expect(again.loading.value).toBe(false)
    release(['b'])
    await again
    expect(again.data.value).toEqual(['b'])
    expect(nuxt.calls).toHaveLength(2)
  })

  it('remembers the hydration payload for the next mount', async () => {
    nuxt.nuxtApp.isHydrating = true
    nuxt.nuxtApp.payload.data.list = ['ssr']
    const first = await useCachedFetch<string[]>('/api/list', { key: 'list' })
    expect(first.data.value).toEqual(['ssr'])
    nuxt.nuxtApp.isHydrating = false
    delete nuxt.nuxtApp.payload.data.list
    const again = await useCachedFetch<string[]>('/api/list', { key: 'list' })
    expect(again.data.value).toEqual(['ssr'])
    expect(nuxt.calls).toHaveLength(0)
  })

  it('refresh fetches and updates the cache, with transform applied once', async () => {
    let n = 0
    nuxt.respondWith(async () => [++n])
    const first = await useCachedFetch<number[], number>('/api/list', { key: 'list', transform: list => list[0]! * 10 })
    expect(first.data.value).toBe(10)
    await first.refresh()
    expect(first.data.value).toBe(20)
    const again = await useCachedFetch<number[], number>('/api/list', { key: 'list', transform: list => list[0]! * 10 })
    expect(again.data.value).toBe(20)
    expect(nuxt.calls).toHaveLength(2)
  })

  it('surfaces errors instead of empty data', async () => {
    nuxt.respondWith(async () => {
      throw new Error('Forbidden')
    })
    const { data, error, status, loading } = await useCachedFetch<string[]>('/api/list', { key: 'list' })
    expect(status.value).toBe('error')
    expect(error.value).toBeInstanceOf(Error)
    expect(data.value).toBeUndefined()
    expect(loading.value).toBe(false)
  })

  it('clearCachedFetch forgets remembered responses', async () => {
    nuxt.respondWith(async () => ['a'])
    await useCachedFetch<string[]>('/api/list', { key: 'list' })
    clearCachedFetch('list')
    await useCachedFetch<string[]>('/api/list', { key: 'list' })
    expect(nuxt.calls).toHaveLength(2)
  })

  it('primeCachedFetch seeds a response the next mount uses', async () => {
    primeCachedFetch('list', ['warm'])
    const { data } = await useCachedFetch<string[]>('/api/list', { key: 'list', ttl: 60_000 })
    expect(data.value).toEqual(['warm'])
    expect(nuxt.calls).toHaveLength(0)
  })
})
