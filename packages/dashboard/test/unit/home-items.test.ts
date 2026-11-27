import { describe, expect, it } from 'vitest'
import { resolveHomeTab } from '../../src/runtime/shared/home-tab'
import { pickItems } from '../../src/runtime/shared/layout'

const items = [{ id: 'crew.status' }, { id: 'shifts.next' }, { id: 'shifts.on-now' }, { id: 'help.checklist' }]

describe('pickItems', () => {
  it('keeps every item without a choice', () => {
    expect(pickItems(items)).toBe(items)
  })

  it('keeps only the chosen items, in the chosen order, skipping unknown ids', () => {
    expect(pickItems(items, ['help.checklist', 'shifts.next', 'gone']).map(item => item.id)).toEqual(['help.checklist', 'shifts.next'])
    expect(pickItems(items, [])).toEqual([])
  })
})

describe('homeTab.items', () => {
  it('passes the chosen items on, once each, and none by default', () => {
    expect(resolveHomeTab({ items: ['shifts.next', 'shifts.next', ''] }, { mobile: true })?.items).toEqual(['shifts.next'])
    expect(resolveHomeTab(undefined, { mobile: true })?.items).toBeUndefined()
  })
})
