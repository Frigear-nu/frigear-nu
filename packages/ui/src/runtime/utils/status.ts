import type { StatusColor } from '../types'

const DEFAULT_STATUS_COLORS: Record<string, StatusColor> = {
  published: 'success',
  active: 'success',
  trialing: 'success',
  paid: 'success',
  succeeded: 'success',
  pending: 'warning',
  past_due: 'warning',
  incomplete: 'warning',
  scheduled: 'warning',
  failed: 'error',
}

/**
 * The badge colour of a status: green for done or live states (published, active, trialing, paid, succeeded), amber
 * for states that need attention (pending, past_due, incomplete, scheduled), red for failed, neutral otherwise.
 * `overrides` (keyed by lower-case status) win.
 */
export function statusColor(status: string | null | undefined, overrides: Record<string, StatusColor> = {}): StatusColor {
  if (!status) return 'neutral'
  const key = status.toLowerCase()
  return overrides[key] ?? DEFAULT_STATUS_COLORS[key] ?? 'neutral'
}
