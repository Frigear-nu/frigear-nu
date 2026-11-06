import type { MobileNavbarAction } from '../../../types'

/** Runs a navbar action: its `onSelect`, then a navigation to its `to`. */
export async function runNavbarAction(action: MobileNavbarAction, navigate: (to: string) => unknown): Promise<void> {
  if (action.disabled) return
  await action.onSelect?.()
  if (action.to) await navigate(action.to)
}
