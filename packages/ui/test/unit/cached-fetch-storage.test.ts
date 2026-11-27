import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, markRaw, ref, shallowRef, toValue } from 'vue'
import type { Ref } from 'vue'
import { createStorage } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'
import type { Storage } from 'unstorage'
import {
  clearCachedFetch,
  flushCachedFetch,
  hydrateCachedFetch,
  provideCachedFetchStorage,
  setCachedFetchOwner,
  useCachedAsyncData,
  useCachedFetch,
  useCachedFetchStore,
} from '../../src/runtime/composables/useCachedFetch'
import { cachedFetchScopeOf, resetPersistence, storageKeyOf } from '../../src/runtime/shared/cached-fetch-storage'

// The composable imports its Nuxt helpers from `#imports`: hand it the stubs `fakeNuxt` puts on `globalThis`.
vi.mock('#imports', () => new Proxy({}, { has: () => true, get: (_, key) => (globalThis as Record<PropertyKey, unknown>)[key] }))

type Options = {
  key?: string
  default: () => unknown
  getCachedData: (key: string, nuxtApp: unknown, ctx: { cause: string }) => unknown
  transform: (input: unknown) => Promise<unknown>
}

/**
 * One run of the app: a fresh `useState` (the in-memory cache) and stand-ins for `useFetch` / `useAsyncData` that do
 * what Nuxt's `asyncData.ts` does with the options the composables set. A new `fakeNuxt()` is a cold start.
 */
function fakeNuxt() {
  const state: Record<string, Ref<unknown>> = {}
  const nuxtApp = { isHydrating: false, payload: { data: {} as Record<string, unknown> } }
  let respond: (url: string) => Promise<unknown> = async () => []
  const calls: string[] = []

  const asyncData = (key: string, request: () => Promise<unknown>, options: Options) => {
    const data = shallowRef<unknown>()
    const status = shallowRef('idle')
    const error = shallowRef<unknown>()
    const run = async (cause: string) => {
      const cached = options.getCachedData(key, nuxtApp, { cause })
      if (cached !== undefined) {
        data.value = cached
        status.value = 'success'
        return
      }
      status.value = 'pending'
      try {
        data.value = await options.transform(await request())
        status.value = 'success'
      }
      catch (e) {
        error.value = e
        data.value = options.default()
        status.value = 'error'
      }
    }
    const initial = options.getCachedData(key, nuxtApp, { cause: 'initial' })
    data.value = initial !== undefined ? initial : options.default()
    const promise = initial !== undefined ? Promise.resolve((status.value = 'success')) : run('initial')
    const clear = () => {
      data.value = undefined
    }
    const result = { data, status, error, refresh: () => run('refresh:manual'), execute: () => run('refresh:manual'), clear }
    return Object.assign(promise.then(() => result), result)
  }

  vi.stubGlobal('useState', (key: string, init: () => unknown) => (state[key] ??= ref(init())))
  vi.stubGlobal('markRaw', markRaw)
  vi.stubGlobal('toValue', toValue)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useRuntimeConfig', () => ({ public: {} }))
  vi.stubGlobal('useFetch', (url: string, options: Options) => asyncData(options.key!, () => {
    calls.push(url)
    return respond(url)
  }, options))
  vi.stubGlobal('useAsyncData', (key: unknown, handler: () => Promise<unknown>, options: Options) => asyncData(toValue(key as string), () => {
    calls.push(`handler:${toValue(key as string)}`)
    return handler()
  }, options))

  return {
    calls,
    respondWith(fn: (url: string) => Promise<unknown>) {
      respond = fn
    },
  }
}

describe('useCachedFetch with a storage', () => {
  let storage: Storage
  let nuxt: ReturnType<typeof fakeNuxt>

  /** A cold start: a new app, the same storage, the stored responses read back for `owner`. */
  async function coldStart(owner = 'user:1') {
    nuxt = fakeNuxt()
    provideCachedFetchStorage(storage)
    setCachedFetchOwner(owner, { keep: true })
    await hydrateCachedFetch({ timeout: 0 })
  }

  beforeEach(async () => {
    storage = createStorage({ driver: memoryDriver() })
    await coldStart()
  })

  afterEach(() => {
    resetPersistence()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('writes responses under the owner and reads them back after a cold start', async () => {
    nuxt.respondWith(async () => ['a'])
    await useCachedFetch<string[]>('/api/list', { key: 'list?page=1' })
    await flushCachedFetch()
    expect(await storage.getKeys()).toEqual([storageKeyOf('list?page=1', 'user:1')])
    expect(await storage.getItem(storageKeyOf('list?page=1', 'user:1'))).toMatchObject({ v: 1, key: 'list?page=1', data: ['a'] })

    await coldStart()
    expect(useCachedFetchStore().value['list?page=1']).toMatchObject({ data: ['a'], restored: true })
  })

  it('shows a restored response at once, then refetches it whatever the ttl', async () => {
    nuxt.respondWith(async () => ['a'])
    await useCachedFetch<string[]>('/api/list', { key: 'list', ttl: 60 * 60_000 })
    await flushCachedFetch()

    await coldStart()
    let release!: (value: unknown) => void
    nuxt.respondWith(() => new Promise((resolve) => {
      release = resolve
    }))
    const fetched = useCachedFetch<string[]>('/api/list', { key: 'list', ttl: 60 * 60_000, instant: true })
    // Stale: on screen at once, nothing to wait for, while the request is out.
    expect(fetched.data.value).toEqual(['a'])
    expect(fetched.loading.value).toBe(false)
    expect(nuxt.calls).toEqual(['/api/list'])
    // With `instant` (the mobile app), awaiting it (a page) does not wait for the network either.
    await fetched
    expect(fetched.data.value).toEqual(['a'])
    release(['b'])
    await vi.waitFor(() => expect(fetched.data.value).toEqual(['b']))

    // Fetched in this run: the ttl applies again.
    const again = await useCachedFetch<string[]>('/api/list', { key: 'list', ttl: 60 * 60_000 })
    expect(again.data.value).toEqual(['b'])
    expect(nuxt.calls).toHaveLength(1)
  })

  it('keeps showing a restored response when the refetch fails', async () => {
    nuxt.respondWith(async () => ['a'])
    await useCachedFetch<string[]>('/api/list', { key: 'list' })
    await flushCachedFetch()

    await coldStart()
    nuxt.respondWith(async () => {
      throw new Error('offline')
    })
    const { data, error } = await useCachedFetch<string[]>('/api/list', { key: 'list' })
    await vi.waitFor(() => expect(error.value).toBeInstanceOf(Error))
    expect(data.value).toEqual(['a'])
  })

  it('never reads back another owner\'s responses, and deletes them', async () => {
    nuxt.respondWith(async () => ['mine'])
    await useCachedFetch<string[]>('/api/list', { key: 'list' })
    await flushCachedFetch()

    await coldStart('user:2')
    expect(useCachedFetchStore().value.list).toBeUndefined()
    await vi.waitFor(async () => expect(await storage.getKeys()).toEqual([]))
  })

  it('forgets everything, in memory and in storage, when the owner changes (sign-out)', async () => {
    nuxt.respondWith(async () => ['mine'])
    await useCachedFetch<string[]>('/api/list', { key: 'list' })
    await flushCachedFetch()

    setCachedFetchOwner(cachedFetchScopeOf(null))
    expect(useCachedFetchStore().value).toEqual({})
    await vi.waitFor(async () => expect(await storage.getKeys()).toEqual([]))
    await useCachedFetch<string[]>('/api/list', { key: 'list' })
    expect(nuxt.calls).toHaveLength(2)
  })

  it('never remembers a response that lands after the user changed', async () => {
    let release!: (value: unknown) => void
    nuxt.respondWith(() => new Promise((resolve) => {
      release = resolve
    }))
    const fetched = useCachedFetch<string[]>('/api/list', { key: 'list' })
    setCachedFetchOwner('guest')
    release(['of user 1'])
    await fetched
    await flushCachedFetch()
    expect(useCachedFetchStore().value.list).toBeUndefined()
    expect(await storage.getKeys()).toEqual([])
  })

  it('keeps the cache when the owner is set again unchanged', async () => {
    nuxt.respondWith(async () => ['mine'])
    await useCachedFetch<string[]>('/api/list', { key: 'list' })
    setCachedFetchOwner('user:1')
    expect(useCachedFetchStore().value.list).toBeDefined()
  })

  it('clearCachedFetch deletes the stored responses too', async () => {
    nuxt.respondWith(async () => ['a'])
    await useCachedFetch<string[]>('/api/one', { key: 'one' })
    await useCachedFetch<string[]>('/api/two', { key: 'two' })
    await flushCachedFetch()

    clearCachedFetch('one')
    await vi.waitFor(async () => expect(await storage.getKeys()).toEqual([storageKeyOf('two', 'user:1')]))
  })

  it('drops responses older than maxAge instead of showing them', async () => {
    await storage.setItem(storageKeyOf('old', 'user:1'), { v: 1, key: 'old', at: Date.now() - 8 * 24 * 60 * 60_000, data: [1] })
    await storage.setItem(storageKeyOf('new', 'user:1'), { v: 1, key: 'new', at: Date.now() - 60_000, data: [2] })
    await storage.setItem(storageKeyOf('broken', 'user:1'), 'not json')

    await coldStart()
    expect(Object.keys(useCachedFetchStore().value)).toEqual(['new'])
    await vi.waitFor(async () => expect(await storage.getKeys()).toEqual([storageKeyOf('new', 'user:1')]))
  })

  it('leaves out responses with persist: false', async () => {
    nuxt.respondWith(async () => ['secret'])
    await useCachedFetch<string[]>('/api/tokens', { key: 'tokens', persist: false })
    await flushCachedFetch()
    expect(await storage.getKeys()).toEqual([])
  })

  it('does not hold the start for a slow storage, and fills what nothing fetched yet once it answers', async () => {
    let answer!: (keys: string[]) => void
    const slow = {
      getKeys: () => new Promise<string[]>((resolve) => {
        answer = resolve
      }),
      getItem: async (key: string) => ({ v: 1, key: decodeURIComponent(key.split(':')[1]!), at: Date.now(), data: ['disk'] }),
      setItem: async () => {},
      removeItem: async () => {},
    }
    nuxt = fakeNuxt()
    provideCachedFetchStorage(slow)
    setCachedFetchOwner('user:1', { keep: true })
    const started = Date.now()
    await hydrateCachedFetch({ timeout: 20 })
    expect(Date.now() - started).toBeLessThan(1000)

    nuxt.respondWith(async () => ['network'])
    await useCachedFetch<string[]>('/api/list', { key: 'list' })
    answer([storageKeyOf('list', 'user:1'), storageKeyOf('other', 'user:1')])
    await vi.waitFor(() => expect(useCachedFetchStore().value.other).toBeDefined())
    // The fresh response wins over the late one from disk.
    expect(useCachedFetchStore().value.list?.data).toEqual(['network'])
  })

  it('coalesces a burst of responses into one write per key', async () => {
    const setItem = vi.spyOn(storage, 'setItem')
    vi.useFakeTimers()
    nuxt.respondWith(async () => ['a'])
    const fetched = await useCachedFetch<string[]>('/api/list', { key: 'list' })
    await fetched.refresh()
    await fetched.refresh()
    expect(setItem).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(setItem).toHaveBeenCalledTimes(1)
  })
})

describe('useCachedAsyncData', () => {
  afterEach(() => {
    resetPersistence()
    vi.unstubAllGlobals()
  })

  it('remembers what the handler returns by key, and persists it', async () => {
    const nuxt = fakeNuxt()
    const storage = createStorage({ driver: memoryDriver() })
    provideCachedFetchStorage(storage)
    let n = 0
    const first = await useCachedAsyncData('faqs', async () => ({ n: ++n }))
    expect(first.data.value).toEqual({ n: 1 })
    const again = await useCachedAsyncData('faqs', async () => ({ n: ++n }))
    expect(again.data.value).toEqual({ n: 1 })
    expect(nuxt.calls).toEqual(['handler:faqs'])
    await flushCachedFetch()
    expect(await storage.getItem(storageKeyOf('faqs', 'guest'))).toMatchObject({ data: { n: 1 } })
  })

  it('takes a reactive key, and loading is true only until the first response', async () => {
    fakeNuxt()
    const slug = ref('a')
    const pending = useCachedAsyncData(() => `article:${slug.value}`, async () => slug.value, { ttl: 0 })
    expect(pending.loading.value).toBe(true)
    await pending
    expect(pending.data.value).toBe('a')
    expect(useCachedFetchStore().value['article:a']?.data).toBe('a')
  })
})
