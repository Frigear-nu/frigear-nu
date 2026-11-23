import { describe, expect, it } from 'vitest'
import { resolveHub } from '../../src/runtime/shared/hub'

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
