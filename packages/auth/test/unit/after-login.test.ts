import { describe, expect, it } from 'vitest'
import { isAppPage } from '../../src/runtime/app/utils/after-login'

describe('isAppPage', () => {
  it('accepts matched pages', () => {
    expect(isAppPage([{ path: '/account' }])).toBe(true)
    expect(isAppPage([{ path: '/app' }, { path: '/app/teams/:team()' }])).toBe(true)
  })

  it('rejects unmatched paths (server routes)', () => {
    expect(isAppPage([])).toBe(false)
  })

  it('rejects paths only a catch-all page matches', () => {
    expect(isAppPage([{ path: '/:path(.*)*' }])).toBe(false)
    expect(isAppPage([{ path: '/:lang?/:path(.*)*' }])).toBe(false)
  })
})
