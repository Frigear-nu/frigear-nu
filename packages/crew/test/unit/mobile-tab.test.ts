import { describe, expect, it } from 'vitest'
import { crewMobileTab } from '../../src/mobile-tab'

describe('crewMobileTab', () => {
  it('opens the crew home in the hub, with its tabs, when the home is in the hub', () => {
    expect(crewMobileTab({ home: '/dashboard/crew', status: '/crew/status', inDashboard: true })).toMatchObject({ id: 'crew', to: '/dashboard/crew', requiresAuth: true })
  })

  it('opens My crew without the hub, and is left out without a page', () => {
    expect(crewMobileTab({ home: '/crew', status: '/crew/status', inDashboard: false })?.to).toBe('/crew/status')
    expect(crewMobileTab({ status: undefined, inDashboard: false })).toBeUndefined()
    expect(crewMobileTab({ home: '/dashboard/crew', status: undefined, inDashboard: true })?.to).toBe('/dashboard/crew')
  })
})
