import { describe, expect, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { extendCrewHomeTabs } from '../../src/home-tabs'

const tab = { id: 'shifts', component: '/abs/HomeShifts.vue', order: 20, label: 'My shifts' }
const fakeNuxt = () => ({ options: {}, callHook: () => undefined }) as unknown as Nuxt & { options: { widgets?: { _tabs?: Record<string, { id: string }[]> } } }

describe('extendCrewHomeTabs', () => {
  it('adds the tabs before @frigear-nu/widget is installed (it comes in later as a dependency, e.g. in a mobile app)', async () => {
    const nuxt = fakeNuxt()
    // No module is installed on this Nuxt at all: the tabs are registered for when Widget is.
    expect(await extendCrewHomeTabs(nuxt, [tab])).toBe(true)
    expect(nuxt.options.widgets?._tabs?.['crew.dashboard']?.map(item => item.id)).toEqual(['shifts'])
  })

  it('adds nothing without the widget package or without tabs', async () => {
    const nuxt = fakeNuxt()
    expect(await extendCrewHomeTabs(nuxt, [tab], () => Promise.reject(new Error('Cannot find package')))).toBe(false)
    expect(await extendCrewHomeTabs(nuxt, [])).toBe(false)
    expect(nuxt.options.widgets).toBeUndefined()
  })
})
