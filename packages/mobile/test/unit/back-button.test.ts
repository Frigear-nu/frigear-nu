import { describe, expect, it } from 'vitest'
import { decideBackAction, type BackInput } from '../../src/runtime/shared/back-button'

const input = (overrides: Partial<BackInput>): BackInput => ({
  overlayOpen: false, canGoBack: false, atTabRoot: false, atHome: false, hasTabs: true, ...overrides,
})

describe('decideBackAction', () => {
  it('closes an open overlay first', () => {
    expect(decideBackAction(input({ overlayOpen: true, canGoBack: true }))).toBe('close-overlay')
  })
  it('goes back within a tab', () => {
    expect(decideBackAction(input({ canGoBack: true }))).toBe('back')
  })
  it('returns to the first tab from another tab root, then minimizes', () => {
    expect(decideBackAction(input({ atTabRoot: true, canGoBack: true }))).toBe('home')
    expect(decideBackAction(input({ atTabRoot: true, atHome: true, canGoBack: true }))).toBe('minimize')
  })
  it('without history: home off the tabs, minimize at home or without tabs', () => {
    expect(decideBackAction(input({}))).toBe('home')
    expect(decideBackAction(input({ hasTabs: false }))).toBe('minimize')
    expect(decideBackAction(input({ hasTabs: false, canGoBack: true }))).toBe('back')
  })
})
