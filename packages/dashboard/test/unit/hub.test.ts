import { describe, expect, it } from 'vitest'
import type { Nuxt } from '@nuxt/schema'
import { resolveHub } from '../../src/runtime/shared/hub'
import { resolveHubDashboardName } from '../../src/runtime/utils/hub'

describe('resolveHub (settings.pages.home, settings.home.dashboard)', () => {
  it('is on at /dashboard with the `home` dashboard by default, when Auth is installed', () => {
    expect(resolveHub(undefined, { auth: true })).toEqual({ path: '/dashboard', dashboard: 'home' })
    expect(resolveHub({ pages: { home: true } }, { auth: true })).toEqual({ path: '/dashboard', dashboard: 'home' })
  })

  it('takes a path and a dashboard name', () => {
    expect(resolveHub({ pages: { home: '/me' }, home: { dashboard: 'crew.home' } }, { auth: true }))
      .toEqual({ path: '/me', dashboard: 'crew.home' })
    expect(resolveHub({ pages: { home: 'hub' } }, { auth: true })?.path).toBe('/hub')
  })

  it('is off with `false`, and without Auth', () => {
    expect(resolveHub({ pages: { home: false } }, { auth: true })).toBeUndefined()
    expect(resolveHub(undefined, { auth: false })).toBeUndefined()
    expect(resolveHub({ pages: { home: '/me' } }, { auth: false })).toBeUndefined()
  })
})

describe('resolveHubDashboardName (for modules adding hub items)', () => {
  const nuxt = (dashboard?: unknown) => ({ options: { dashboard } }) as unknown as Nuxt

  it('is `home` by default, and the configured `settings.home.dashboard` otherwise', () => {
    expect(resolveHubDashboardName(nuxt())).toBe('home')
    expect(resolveHubDashboardName(nuxt({ settings: { pages: { home: '/me' } } }))).toBe('home')
    expect(resolveHubDashboardName(nuxt({ settings: { home: { dashboard: 'crew.home' } } }))).toBe('crew.home')
    expect(resolveHubDashboardName(nuxt(false))).toBe('home')
  })
})
