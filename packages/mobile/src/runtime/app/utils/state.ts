import { shallowReactive, useNuxtApp, useState } from '#imports'
import type { MobileNavbarAction } from '../../../types'

/** Open dialogs / slideovers / drawers (counted by the mobile plugin) and open `suppress()` calls. */
export const useOverlayCount = () => useState('mobile:overlays', () => 0)
export const useSuppressCount = () => useState('mobile:suppressed', () => 0)
/** Whether the splash screen is up (set by the splash plugin). */
export const useSplashVisible = () => useState('mobile:splash', () => false)

/** What one `useMobileNavbarActions()` call shows: its actions, on the path of the page that made it. */
export interface NavbarActionsEntry {
  path: () => string
  actions: () => MobileNavbarAction[]
}

/**
 * The `useMobileNavbarActions()` calls of the mounted pages. Kept on the app rather than in `useState`: actions hold
 * functions, which do not belong in the payload.
 */
export function useNavbarActionRegistry(): Map<symbol, NavbarActionsEntry> {
  const nuxtApp = useNuxtApp() as ReturnType<typeof useNuxtApp> & { _mobileNavbarActions?: Map<symbol, NavbarActionsEntry> }
  nuxtApp._mobileNavbarActions ??= shallowReactive(new Map())
  return nuxtApp._mobileNavbarActions
}
