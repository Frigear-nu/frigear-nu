import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

// The composable runs outside a component here: `onMounted` runs at once, `onBeforeUnmount` is kept to call by hand.
const unmount = vi.hoisted(() => ({ hooks: [] as Array<() => void> }))
const fetcher = vi.hoisted(() => ({ fn: (_url: string): Promise<unknown> => Promise.resolve(null) }))
vi.mock('#imports', async () => {
  const vue = await import('vue')
  return {
    ...vue,
    $fetch: (url: string) => fetcher.fn(url),
    onMounted: (hook: () => void) => hook(),
    onBeforeUnmount: (hook: () => void) => unmount.hooks.push(hook),
  }
})
vi.mock('#maps/registry', () => ({
  layers: {
    'ops.crowd': { id: 'ops.crowd', label: 'Crowd', appliesTo: ['ops.venue'], endpoint: '/api/crowd/:operationId', refreshInterval: null, permission: null, visible: true, color: null },
    'ops.hidden': { id: 'ops.hidden', label: 'Hidden', appliesTo: ['ops.venue'], endpoint: '/api/hidden/:operationId', refreshInterval: null, permission: null, visible: false, color: null },
  },
}))

const collection = (id: string) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', id, geometry: { type: 'Point', coordinates: [1, 2] }, properties: { label: id } }] })

function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useMapLiveLayers', () => {
  afterEach(() => {
    for (const hook of unmount.hooks.splice(0)) hook()
  })

  it('starts a layer registered with visible: false hidden, and does not fetch it', async () => {
    const urls: string[] = []
    fetcher.fn = async (url) => {
      urls.push(url)
      return collection(url)
    }
    const { useMapLiveLayers } = await import('../../src/runtime/app/composables/useMapLiveLayers')
    const { hidden } = useMapLiveLayers({ surface: 'ops.venue', params: { operationId: 'a' } })
    await nextTick()
    expect(hidden.value).toEqual(['ops.hidden'])
    expect(urls).toEqual(['/api/crowd/a'])
  })

  it('drops an answer for the old params that arrives after the new one', async () => {
    const pending = new Map<string, ReturnType<typeof deferred>>()
    fetcher.fn = (url) => {
      const wait = deferred()
      pending.set(url, wait)
      return wait.promise
    }
    const { useMapLiveLayers } = await import('../../src/runtime/app/composables/useMapLiveLayers')
    const params = ref({ operationId: 'old' })
    const { layers } = useMapLiveLayers({ surface: 'ops.venue', params, only: ['ops.crowd'] })
    params.value = { operationId: 'new' }
    await nextTick()
    expect([...pending.keys()]).toEqual(['/api/crowd/old', '/api/crowd/new'])

    pending.get('/api/crowd/new')!.resolve(collection('new'))
    await vi.waitFor(() => expect(layers.value[0]?.collection?.features[0]?.id).toBe('new'))
    pending.get('/api/crowd/old')!.resolve(collection('old'))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(layers.value[0]?.url).toBe('/api/crowd/new')
    expect(layers.value[0]?.collection?.features[0]?.id).toBe('new')
  })
})
