import type { Permission } from '@frigear-nu/auth/access'

/** What the Wallet's scanner checks: someone's Frigear ID, an event ticket at the door, or a shift pass. */
export type ScanMode = 'frigear-id' | 'ticket' | 'shift'

export interface ScanModeDefinition {
  id: ScanMode
  /** The website's permission for it (the token carries it when its scope was granted). */
  permission: string
  icon: string
}

/** The scan modes in the order of the mode switch. */
export const SCAN_MODES: readonly ScanModeDefinition[] = [
  // Crew and up (the website's `authorization.roles`).
  { id: 'frigear-id', permission: 'frigear-id:verify', icon: 'i-lucide-id-card' },
  // Event managers and up (@frigear-nu/events).
  { id: 'ticket', permission: 'events:manage', icon: 'i-lucide-ticket' },
  // Bar managers and up (@frigear-nu/shifts).
  { id: 'shift', permission: 'shifts:checkin', icon: 'i-lucide-calendar-check' },
]

/** What a Frigear ID QR code holds before the signed code. */
export const FRIGEAR_ID_PREFIX = 'urn:frigear:id:'

/**
 * The scan modes the signed-in user may use. Only what the app shows: the website checks the permission on every scan.
 * The permissions are the website's, not registered in this app, so they are not in its `Permission` union.
 */
export function useScanModes() {
  const { can } = useAuthorization()
  const modes = computed(() => SCAN_MODES.filter(mode => can(mode.permission as Permission)))
  return { modes, canScan: computed(() => modes.value.length > 0) }
}
