import { describe, expect, it, vi } from 'vitest'
import { runNavbarAction } from '../../src/runtime/app/utils/navbar-actions'

describe('runNavbarAction', () => {
  it('runs onSelect, then navigates to `to`', async () => {
    const order: string[] = []
    const navigate = vi.fn(async (to: string) => {
      order.push(`navigate ${to}`)
    })
    await runNavbarAction({ id: 'a', label: 'A', onSelect: async () => {
      order.push('select')
    }, to: '/settings' }, navigate)
    expect(order).toEqual(['select', 'navigate /settings'])
  })

  it('does nothing for a disabled action, and does not navigate without `to`', async () => {
    const onSelect = vi.fn()
    const navigate = vi.fn()
    await runNavbarAction({ id: 'a', label: 'A', onSelect, to: '/x', disabled: true }, navigate)
    await runNavbarAction({ id: 'b', label: 'B', onSelect }, navigate)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
  })
})
