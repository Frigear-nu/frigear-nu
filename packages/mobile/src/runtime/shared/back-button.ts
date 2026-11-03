export type BackAction = 'close-overlay' | 'back' | 'home' | 'minimize'

export interface BackInput {
  /** An overlay (dialog, slideover, drawer) is open. */
  overlayOpen: boolean
  /** The WebView has history to go back to (Capacitor's `canGoBack`). */
  canGoBack: boolean
  /** The current page is a tab's root page. */
  atTabRoot: boolean
  /** The current page is the first tab's root page (the app's home). */
  atHome: boolean
  /** The app has tabs. */
  hasTabs: boolean
}

/**
 * The Android back button, as Android apps behave: close the open overlay, else go back within a tab, else from
 * another tab's root return to the first tab, else leave the app (minimize, so it resumes where it was).
 */
export function decideBackAction(input: BackInput): BackAction {
  if (input.overlayOpen) return 'close-overlay'
  if (input.hasTabs && input.atTabRoot) return input.atHome ? 'minimize' : 'home'
  if (input.canGoBack) return 'back'
  if (input.hasTabs && !input.atHome) return 'home'
  return 'minimize'
}
