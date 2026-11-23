import { describe, expect, it } from 'vitest'
import { findActiveTab, normalizeTabs } from '@frigear-nu/mobile/utils'
import { resolveHomeTab } from '../../src/runtime/shared/home-tab'

// The Home tab opens `/crew` and matches everything below it by default, and the Crew tab of `@frigear-nu/crew` opens
// `/crew/status`. The tab bar selects ONE tab (the most specific match), so on the status page Crew is highlighted, not
// Home. This pins that, so a change to either tab's `match` cannot light up both.
describe('the Home tab next to the Crew tab', () => {
  const home = resolveHomeTab(undefined, { mobile: true })!.tab
  const crew = { id: 'crew', to: '/crew/status', label: 'Crew', icon: 'i-lucide-hand-heart', requiresAuth: true }
  const { tabs, errors } = normalizeTabs([home, crew])

  it('registers both tabs without problems', () => {
    expect(errors).toEqual([])
    expect(tabs.map(tab => tab.id)).toEqual(['home', 'crew'])
  })

  it('selects Home on /crew and Crew on /crew/status, never both', () => {
    expect(findActiveTab(tabs, '/crew')?.id).toBe('home')
    expect(findActiveTab(tabs, '/crew/status')?.id).toBe('crew')
    expect(findActiveTab(tabs, '/crew/status/')?.id).toBe('crew')
  })
})
