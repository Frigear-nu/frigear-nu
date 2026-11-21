import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, type Ref } from 'vue'
import type { DashboardLayout } from '../../src/types'

type Layouts = Record<string, DashboardLayout>

const env = vi.hoisted(() => ({
  state: new Map<string, unknown>(),
  app: {} as object,
  showError: (() => {}) as (error: unknown, title?: string) => void,
  prefs: undefined as undefined | (() => unknown),
  session: undefined as undefined | (() => unknown),
}))

vi.mock('#imports', () => ({
  useState: <T>(key: string, init: () => T) => {
    if (!env.state.has(key)) env.state.set(key, ref(init()))
    return env.state.get(key)
  },
  useNuxtApp: () => env.app,
  useModuleT: () => (_key: string, fallback: string) => fallback,
  useErrorToast: () => (error: unknown, title?: string) => env.showError(error, title),
}))
vi.mock('#dashboard/optional', () => ({
  useUserPreferences: () => env.prefs?.(),
  useUserSession: () => env.session?.(),
}))
vi.mock('#dashboard/registry', () => ({
  dashboards: { 'crew.home': { a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' } } },
}))
vi.mock('#widgets/registry', () => ({
  widgets: { 'dashboard.crew.home': [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
}))

const { useDashboardLayout } = await import('../../src/runtime/app/composables/useDashboardLayout')

const layout = (patch: Partial<DashboardLayout> = {}): DashboardLayout => ({ order: [], hidden: [], collapsed: [], ...patch })

/** A Preferences stand-in: `set` resolves when `release()` is called (or at once with `auto`), or rejects with `fail`. */
function preferences(initial: Layouts, { auto = true } = {}) {
  const stored = ref<{ dashboardLayouts?: Layouts }>({ dashboardLayouts: initial })
  const releases: Array<() => void> = []
  let fail: Error | undefined
  const set = vi.fn((_key: string, value: Layouts) => new Promise<void>((resolve, reject) => {
    const finish = () => {
      if (fail) return reject(fail)
      stored.value = { dashboardLayouts: value }
      resolve()
    }
    if (auto) finish()
    else releases.push(finish)
  }))
  env.prefs = () => ({ preferences: stored, set })
  return {
    set,
    stored,
    failWith: (error: Error) => { fail = error },
    release: () => releases.shift()?.(),
  }
}

function signIn(id: string | number | undefined) {
  const user: Ref<{ id?: string | number } | null> = ref(id === undefined ? null : { id })
  const loggedIn = ref(id !== undefined)
  env.session = () => ({ loggedIn, user })
  return { user, loggedIn }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  env.state.clear()
  env.app = {}
  env.showError = vi.fn()
  env.prefs = undefined
  env.session = undefined
})

describe('useDashboardLayout', () => {
  it('reads the saved preference over the default, and a session change over both', async () => {
    preferences({ 'crew.home': layout({ hidden: ['a'] }) })
    signIn(1)
    const { layout: current, update } = useDashboardLayout('crew.home')
    expect(current.value.hidden).toEqual(['a'])

    await update(value => ({ ...value, collapsed: ['b'] }))
    expect(current.value).toEqual(layout({ hidden: ['a'], collapsed: ['b'] }))
  })

  it('uses the default without a saved layout', () => {
    preferences({})
    signIn(1)
    expect(useDashboardLayout('crew.home').layout.value).toEqual(layout())
  })

  it('saves the full map: the other dashboards stay as saved', async () => {
    const prefs = preferences({ 'other': layout({ hidden: ['x'] }), 'crew.home': layout() })
    signIn(1)
    const { update, persisted } = useDashboardLayout('crew.home')
    expect(persisted.value).toBe(true)

    await update(value => ({ ...value, hidden: ['b'] }))
    expect(prefs.set).toHaveBeenCalledTimes(1)
    expect(prefs.set).toHaveBeenCalledWith('dashboardLayouts', {
      'other': layout({ hidden: ['x'] }),
      'crew.home': layout({ hidden: ['b'] }),
    })
  })

  it('drops ids that are not items of the dashboard before saving', async () => {
    const prefs = preferences({})
    signIn(1)
    const { update } = useDashboardLayout('crew.home')
    await update(() => ({ order: ['gone', 'c', 'a'], hidden: ['old'], collapsed: ['b'], settings: { gone: { x: 1 }, a: { y: 2 } } }))
    expect(prefs.set.mock.calls[0]![1]['crew.home']).toEqual({ order: ['c', 'a'], hidden: [], collapsed: ['b'], settings: { a: { y: 2 } } })
  })

  it('keeps changes for the session only when signed out', async () => {
    const prefs = preferences({})
    signIn(undefined)
    const { update, layout: current, persisted } = useDashboardLayout('crew.home')
    expect(persisted.value).toBe(false)
    await update(value => ({ ...value, hidden: ['a'] }))
    expect(prefs.set).not.toHaveBeenCalled()
    expect(current.value.hidden).toEqual(['a'])
  })

  it('keeps changes for the session only without a cookie session (Auth in client mode: no Preferences import)', async () => {
    env.prefs = undefined // the module only makes `useUserPreferences` available for Auth in server mode
    signIn(1)
    const { update, layout: current, persisted } = useDashboardLayout('crew.home')
    expect(persisted.value).toBe(false)
    await update(value => ({ ...value, hidden: ['c'] }))
    expect(current.value.hidden).toEqual(['c'])
  })

  it('rolls back to the last saved layout and shows an error when saving fails', async () => {
    const prefs = preferences({ 'crew.home': layout({ hidden: ['a'] }) })
    signIn(1)
    const { update, layout: current, saving } = useDashboardLayout('crew.home')
    prefs.failWith(new Error('400'))

    await update(value => ({ ...value, hidden: ['a', 'b'] }))
    expect(current.value.hidden).toEqual(['a'])
    expect(saving.value).toBe(false)
    expect(env.showError).toHaveBeenCalledWith(expect.any(Error), 'Your dashboard layout could not be saved.')
  })

  it('keeps one save in flight and coalesces changes made meanwhile into the latest', async () => {
    const prefs = preferences({}, { auto: false })
    signIn(1)
    const { update, saving } = useDashboardLayout('crew.home')

    const first = update(value => ({ ...value, hidden: ['a'] }))
    await flush()
    expect(saving.value).toBe(true)
    const second = update(value => ({ ...value, collapsed: ['b'] }))
    const third = update(value => ({ ...value, order: ['c'] }))
    await flush()
    expect(prefs.set).toHaveBeenCalledTimes(1)

    prefs.release()
    await flush()
    expect(prefs.set).toHaveBeenCalledTimes(2)
    expect(prefs.set.mock.calls[1]![1]['crew.home']).toEqual(layout({ order: ['c'], hidden: ['a'], collapsed: ['b'] }))

    prefs.release()
    await Promise.all([first, second, third])
    expect(prefs.set).toHaveBeenCalledTimes(2)
    expect(saving.value).toBe(false)
  })

  it('drops the session copy when another user signs in', async () => {
    preferences({}, { auto: false })
    env.prefs = undefined
    const { user } = signIn(1)
    const { update, layout: current } = useDashboardLayout('crew.home')
    await update(value => ({ ...value, hidden: ['a'] }))
    expect(current.value.hidden).toEqual(['a'])

    user.value = { id: 2 }
    expect(current.value.hidden).toEqual([])
  })
})
