import { describe, expect, it } from 'vitest'
import { defaultTabMatch, findActiveTab, findTabsWithoutPage, isTabRoot, matchesPath, normalizeTabs, tabRootAt } from '../../src/runtime/shared/tabs'
import { menuItemsToTabs } from '../../src/runtime/shared/menu'
import { extendMobileTabs } from '../../src/runtime/utils'
import type { MobileTabDefinition } from '../../src/types'

const home: MobileTabDefinition = { id: 'home', to: '/', label: 'Home', icon: 'i-lucide-house', sfSymbol: 'house' }
const bills: MobileTabDefinition = { id: 'bills', to: '/bills', label: 'Bills', icon: 'i-lucide-receipt', sfSymbol: 'list.bullet' }

describe('matchesPath', () => {
  it('matches exact paths, ignoring a trailing slash', () => {
    expect(matchesPath('/bills', '/bills')).toBe(true)
    expect(matchesPath('/bills', '/bills/')).toBe(true)
    expect(matchesPath('/bills', '/bills/1')).toBe(false)
  })
  it('matches a /** pattern and everything below it, but not siblings with the same prefix', () => {
    expect(matchesPath('/bills/**', '/bills')).toBe(true)
    expect(matchesPath('/bills/**', '/bills/1/edit')).toBe(true)
    expect(matchesPath('/bills/**', '/billsx')).toBe(false)
    expect(matchesPath('/**', '/anything')).toBe(true)
  })
  it('derives the default match: / only matches itself', () => {
    expect(defaultTabMatch('/')).toEqual(['/'])
    expect(defaultTabMatch('/bills?x=1')).toEqual(['/bills', '/bills/**'])
  })
})

describe('normalizeTabs', () => {
  it('keeps registration order, sorts by order and resolves match / requiresAuth', () => {
    const { tabs, errors, warnings } = normalizeTabs([{ ...bills, requiresAuth: true }, home, { ...home, id: 'first', to: '/first', order: 1 }])
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(tabs.map(tab => tab.id)).toEqual(['first', 'bills', 'home'])
    expect(tabs[1]).toMatchObject({ match: ['/bills', '/bills/**'], requiresAuth: true })
    // Public unless a tab says otherwise: which pages need a user is the app's route rules.
    expect(tabs[2]).toMatchObject({ requiresAuth: false })
  })

  it('lets a later definition with the same id replace fields in place', () => {
    const { tabs } = normalizeTabs([home, bills, { id: 'home', label: 'Start' } as MobileTabDefinition])
    expect(tabs.map(tab => [tab.id, tab.label, tab.to])).toEqual([['home', 'Start', '/'], ['bills', 'Bills', '/bills']])
    expect(tabs[0]!.requiresAuth).toBe(false)
  })

  it('reports invalid tabs as errors', () => {
    const { errors } = normalizeTabs([
      { id: 'bad id!', to: '/', label: 'x', icon: 'i' },
      { id: 'nopath', to: 'bills', label: 'x', icon: 'i' },
      { id: 'noicon', to: '/x', label: 'x' } as MobileTabDefinition,
    ])
    expect(errors).toHaveLength(3)
    expect(errors.join('\n')).toMatch(/invalid id/)
    expect(errors.join('\n')).toMatch(/"nopath" needs a `to`/)
    expect(errors.join('\n')).toMatch(/"noicon" needs an `icon`/)
  })

  it('warns about more than 5 tabs, duplicate paths and native tabs without an SF Symbol', () => {
    const many = Array.from({ length: 6 }, (_, index) => ({ id: `t${index}`, to: `/t${index}`, label: `T${index}`, icon: 'i' }))
    const { warnings } = normalizeTabs([...many, { id: 'dup', to: '/t0', label: 'Dup', icon: 'i', sfSymbol: 's' }], { nativeIcons: true })
    expect(warnings.some(warning => warning.includes('7 tabs'))).toBe(true)
    expect(warnings.some(warning => warning.includes('"t0" and "dup" both open /t0'))).toBe(true)
    expect(warnings.some(warning => warning.includes('"t1" has no `sfSymbol`'))).toBe(true)
  })
})

describe('findActiveTab', () => {
  const { tabs } = normalizeTabs([home, bills, { id: 'new', to: '/bills/new', label: 'New', icon: 'i' }])
  it('picks the most specific match', () => {
    expect(findActiveTab(tabs, '/')?.id).toBe('home')
    expect(findActiveTab(tabs, '/bills/12')?.id).toBe('bills')
    expect(findActiveTab(tabs, '/bills/new')?.id).toBe('new')
    expect(findActiveTab(tabs, '/elsewhere')).toBeUndefined()
  })
  it('prefers the tab a page names', () => {
    expect(findActiveTab(tabs, '/elsewhere', 'bills')?.id).toBe('bills')
    expect(findActiveTab(tabs, '/', 'unknown')?.id).toBe('home')
  })
  it('knows a tab root', () => {
    expect(isTabRoot(tabs[1], '/bills')).toBe(true)
    expect(isTabRoot(tabs[1], '/bills/1')).toBe(false)
  })
  it('finds the tab whose own page a path is', () => {
    expect(tabRootAt(tabs, '/')?.id).toBe('home')
    expect(tabRootAt(tabs, '/bills/')?.id).toBe('bills')
    expect(tabRootAt(tabs, '/bills/new')?.id).toBe('new')
    expect(tabRootAt(tabs, '/bills/12')).toBeUndefined()
    expect(tabRootAt(tabs, '/elsewhere')).toBeUndefined()
    // A page that names a tab is not that tab's root.
    expect(tabRootAt(tabs, '/elsewhere', 'bills')).toBeUndefined()
  })
})

describe('findTabsWithoutPage', () => {
  it('matches static, dynamic, optional and catch-all page paths', () => {
    const tabs = [
      { id: 'home', to: '/' },
      { id: 'bill', to: '/bills/12' },
      { id: 'docs', to: '/docs/a/b' },
      { id: 'opt', to: '/opt' },
      { id: 'missing', to: '/missing' },
    ]
    expect(findTabsWithoutPage(tabs, ['/', '/bills/:id()', '/docs/:slug(.*)*', '/opt/:x?'])).toEqual(['missing'])
  })
})

describe('extendMobileTabs', () => {
  it('appends to the registry on nuxt.options', () => {
    const nuxt = { options: {} } as Parameters<typeof extendMobileTabs>[0]
    extendMobileTabs(nuxt, home)
    extendMobileTabs(nuxt, [bills])
    expect((nuxt.options as unknown as { mobile: { _tabs: MobileTabDefinition[] } }).mobile._tabs.map(tab => tab.id)).toEqual(['home', 'bills'])
  })
})

describe('menuItemsToTabs', () => {
  it('maps menu items, tab fields from meta, and skips items without `to`', () => {
    expect(menuItemsToTabs([
      { label: 'Events', to: '/events', icon: 'i-lucide-calendar', order: 3, meta: { sfSymbol: 'calendar', requiresAuth: false } },
      { label: 'Home', to: '/' },
      { label: 'No link' },
    ])).toEqual([
      { id: 'events', to: '/events', label: 'Events', icon: 'i-lucide-calendar', order: 3, sfSymbol: 'calendar', requiresAuth: false },
      { id: 'home', to: '/', label: 'Home', icon: 'i-lucide-circle' },
    ])
  })
})
