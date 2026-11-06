import { useState } from '#imports'

/** Open dialogs / slideovers / drawers (counted by the mobile plugin) and open `suppress()` calls. */
export const useOverlayCount = () => useState('mobile:overlays', () => 0)
export const useSuppressCount = () => useState('mobile:suppressed', () => 0)
/** Whether the splash screen is up (set by the splash plugin). */
export const useSplashVisible = () => useState('mobile:splash', () => false)
