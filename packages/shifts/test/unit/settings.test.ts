import { describe, expect, it } from 'vitest'
import { allowedSwapKinds, allowsSwapKind, defaultSwapKind, offerKind, validScheduleSettings } from '../../src/runtime/utils/settings'
import type { ShiftCoverage, ShiftHandover } from '../../src/types'

const combos: Array<[ShiftCoverage, ShiftHandover]> = [['all', 'trade'], ['all', 'release'], ['all', 'both'], ['flexible', 'trade'], ['flexible', 'release'], ['flexible', 'both']]

describe('schedule settings', () => {
  it('allows only trades when volunteers must work every shift', () => {
    expect(combos.filter(([coverage, handover]) => validScheduleSettings({ coverage, handover }))).toEqual([
      ['all', 'trade'],
      ['flexible', 'trade'],
      ['flexible', 'release'],
      ['flexible', 'both'],
    ])
  })

  it('allows the kinds of swap each valid combination names', () => {
    expect(allowedSwapKinds({ coverage: 'all', handover: 'trade' })).toEqual(['trade'])
    expect(allowedSwapKinds({ coverage: 'flexible', handover: 'trade' })).toEqual(['trade'])
    expect(allowedSwapKinds({ coverage: 'flexible', handover: 'release' })).toEqual(['release'])
    expect(allowedSwapKinds({ coverage: 'flexible', handover: 'both' })).toEqual(['trade', 'release'])
    // A release lowers the owner's count: never with `coverage: 'all'`, even if the handover were stored wrongly.
    expect(allowsSwapKind({ coverage: 'all', handover: 'both' }, 'release')).toBe(false)
  })

  it('opens a release by default where the schedule allows one, else a trade', () => {
    expect(defaultSwapKind({ coverage: 'flexible', handover: 'both' })).toBe('release')
    expect(defaultSwapKind({ coverage: 'all', handover: 'trade' })).toBe('trade')
    expect(offerKind({ offeredAssignmentId: 'sha_1' })).toBe('trade')
    expect(offerKind({ offeredAssignmentId: null })).toBe('release')
  })
})
