import { describe, expect, it } from 'vitest'
import { effectiveCapacity, shiftCapacityWarnings, shiftGuardWarnings } from '../../src/runtime/utils/guards'
import { canMoveAssignment, canMoveSwap } from '../../src/runtime/utils/status'
import { buildShiftSwapEmail } from '../../src/runtime/server/swap-email'

const CPH = 'Europe/Berlin'
const shift = (id: string, start: string, end: string) => ({ id, startsAt: start, endsAt: end })

describe('guards', () => {
  const morning = shift('a', '2027-06-28T08:00:00Z', '2027-06-28T12:00:00Z')
  const evening = shift('b', '2027-06-28T16:00:00Z', '2027-06-28T20:00:00Z')
  const overlapping = shift('c', '2027-06-28T10:00:00Z', '2027-06-28T14:00:00Z')

  it('warns about two shifts at once, always', () => {
    expect(shiftGuardWarnings(overlapping, [morning], null, CPH).map(w => w.code)).toEqual(['overlap'])
  })

  it('warns about too little rest and too many shifts on a day', () => {
    const codes = shiftGuardWarnings(evening, [morning], { minRestHours: 6, maxShiftsPerDay: 1 }, CPH).map(w => w.code)
    expect(codes).toEqual(['min_rest', 'max_shifts_per_day'])
    expect(shiftGuardWarnings(evening, [morning], { minRestHours: 4, maxShiftsPerDay: 2 }, CPH)).toEqual([])
  })

  it('counts days in the time zone', () => {
    // 23:30 UTC on the 27th is the 28th in Berlin.
    const late = shift('d', '2027-06-27T23:30:00Z', '2027-06-28T01:00:00Z')
    expect(shiftGuardWarnings(evening, [late], { maxShiftsPerDay: 1 }, CPH).map(w => w.code)).toEqual(['max_shifts_per_day'])
    expect(shiftGuardWarnings(evening, [late], { maxShiftsPerDay: 1 }, 'UTC')).toEqual([])
  })

  it('leaves the shift itself out', () => {
    expect(shiftGuardWarnings(morning, [morning], { maxShiftsPerDay: 1 }, CPH)).toEqual([])
  })

  it('works out the capacity and its warnings', () => {
    expect(effectiveCapacity({ capacity: null }, { maxPerShift: 4 })).toBe(4)
    expect(effectiveCapacity({ capacity: 2 }, { maxPerShift: 4 })).toBe(2)
    expect(effectiveCapacity({ capacity: null }, { maxPerShift: null })).toBeNull()
    expect(shiftCapacityWarnings(3, 2, null).map(w => w.code)).toEqual(['shift_full'])
    expect(shiftCapacityWarnings(1, 4, 2).map(w => w.code)).toEqual(['below_min'])
  })
})

describe('state machines', () => {
  it('moves assignments by the table', () => {
    expect(canMoveAssignment('assigned', 'attended')).toBe(true)
    expect(canMoveAssignment('attended', 'cancelled')).toBe(false)
    expect(canMoveAssignment('cancelled', 'assigned')).toBe(false)
  })

  it('moves swaps by the table', () => {
    expect(canMoveSwap('open', 'offered')).toBe(true)
    expect(canMoveSwap('offered', 'pending_approval')).toBe(true)
    expect(canMoveSwap('completed', 'open')).toBe(false)
    expect(canMoveSwap('cancelled', 'open')).toBe(false)
  })
})

describe('swap emails', () => {
  it('fills the variables and names the template', () => {
    const email = buildShiftSwapEmail({
      kind: 'offered',
      email: 'ann@example.com',
      variables: { name: 'Ann', owner: 'Ann', offerer: 'Bo <b>', team: 'Bar 1', when: '28 Jun 2027, 18:00' },
      url: 'https://example.com/shifts/sha_1',
    })
    expect(email).toMatchObject({ to: 'ann@example.com', template: { name: 'shifts-swap-offered' } })
    expect(email!.subject).toBe('New offer for your shift on 28 Jun 2027, 18:00')
    expect(email!.body).toContain('Bo &lt;b&gt; offers to take your shift on Bar 1')
    expect(buildShiftSwapEmail({ kind: 'completed', email: null, variables: { name: '', owner: '', offerer: '', team: '', when: '' } })).toBeNull()
  })
})
