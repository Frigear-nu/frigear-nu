import { describe, expect, it } from 'vitest'
import { DASHBOARD_LIMITS } from '../../src/runtime/preferences'
import { mergeDashboardLayouts, validDashboardLayouts } from '../../src/runtime/shared/stored-layouts'

const layout = (order: string[] = []) => ({ order, hidden: [], collapsed: [] })

describe('stored dashboard layouts', () => {
  it('drops a stored layout that no longer parses and keeps the others', () => {
    const tooMany = Array.from({ length: DASHBOARD_LIMITS.idsPerList + 1 }, (_, index) => `item-${index}`)
    expect(validDashboardLayouts({
      'crew.home': layout(['a']),
      'admin.home': layout(tooMany),
      'broken': { order: 'a' },
      '': layout(),
    })).toEqual({ 'crew.home': layout(['a']) })
    expect(validDashboardLayouts(null)).toEqual({})
    expect(validDashboardLayouts(['x'])).toEqual({})
  })

  it('replaces the named layouts, removes them with null, keeps the rest and caps the count', () => {
    const current = { a: layout(['x']), b: layout() }
    expect(mergeDashboardLayouts(current, { a: layout(['y']), b: null, c: layout() })).toEqual({ a: layout(['y']), c: layout() })
    const full = Object.fromEntries(Array.from({ length: DASHBOARD_LIMITS.dashboards }, (_, index) => [`d${index}`, layout()]))
    expect(mergeDashboardLayouts(full, { extra: layout() })).toBeNull()
    expect(mergeDashboardLayouts(full, { d0: layout(['x']) })).not.toBeNull()
  })
})
