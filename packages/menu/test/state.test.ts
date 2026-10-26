import { describe, expect, it, vi } from 'vitest'

// `vue` is only a transitive (nuxt) dependency of this package; reactivity is irrelevant to the
// isolation being tested, so a plain object stands in for `reactive`.
vi.mock('vue', () => ({ reactive: <T extends object>(value: T) => value }))

const {
  currentMenuStore,
  getAppMenuStore,
  processMenuStore,
  pushMenuItems,
  resetMenus,
  setAppMenuStoreResolver,
} = await import('../src/runtime/app/utils/state')
const { extendMenuItem } = await import('../src/runtime/app/utils/extend')

describe('request-scoped menu state', () => {
  it('gives every app instance its own store', () => {
    const a = {}
    const b = {}
    expect(getAppMenuStore(a)).toBe(getAppMenuStore(a))
    expect(getAppMenuStore(a)).not.toBe(getAppMenuStore(b))
  })

  it('does not leak items or resets between two concurrent app instances', async () => {
    const a = {}
    const b = {}
    const storeA = getAppMenuStore(a)
    const storeB = getAppMenuStore(b)

    pushMenuItems(storeA, 'main', '', { label: 'A' })
    // Request B starts rendering while A is mid-flight, and resets its own state.
    await Promise.resolve()
    resetMenus(storeB)
    pushMenuItems(storeB, 'main', '', { label: 'B' })

    expect(storeA.main![''].map(i => i.label)).toEqual(['A'])
    expect(storeB.main![''].map(i => i.label)).toEqual(['B'])
  })

  it('extendMenuItem writes into the store of the app in scope', () => {
    const a = {}
    const b = {}
    let current: object | undefined
    setAppMenuStoreResolver(() => current && getAppMenuStore(current))

    current = a
    extendMenuItem('main', { label: 'A' })
    current = b
    extendMenuItem('main', { label: 'B' })

    expect(getAppMenuStore(a).main![''].map(i => i.label)).toEqual(['A'])
    expect(getAppMenuStore(b).main![''].map(i => i.label)).toEqual(['B'])
    expect(processMenuStore.main).toBeUndefined()

    // Outside any app, it falls back to the process-wide store instead of an app's.
    current = undefined
    expect(currentMenuStore()).toBe(processMenuStore)
  })
})
