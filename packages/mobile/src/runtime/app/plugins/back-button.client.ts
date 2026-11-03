import { defineNuxtPlugin, navigateTo, useRoute, useRouter } from '#imports'
import type { MobileBackButtonContext } from '../../../types'
import { decideBackAction } from '../../shared/back-button'
import { OPEN_OVERLAY_SELECTOR } from '../../shared/chrome'
import { isTabRoot } from '../../shared/tabs'
import { useCapacitor } from '../composables/useCapacitor'
import { useMobileChrome } from '../composables/useMobileChrome'

/**
 * The Android back button: close the open overlay, else go back, else return to the first tab, else minimize the app
 * (registering a listener turns Capacitor's own handling off). The `mobile:back-button` hook can take it over.
 */
export default defineNuxtPlugin({
  name: 'mobile:back-button',
  dependsOn: ['mobile'],
  async setup(nuxtApp) {
    const capacitor = useCapacitor()
    if (!capacitor.isAndroid) return
    const app = await capacitor.load('app')
    if (!app) return
    const router = useRouter()
    const route = useRoute()
    const { state } = useMobileChrome()

    await app.addListener('backButton', async ({ canGoBack }) => {
      let prevented = false
      const ctx: MobileBackButtonContext = { canGoBack, preventDefault: () => (prevented = true) }
      await nuxtApp.callHook('mobile:back-button', ctx)
      if (prevented) return

      const chrome = state.value
      const home = chrome.tabs[0]
      const action = decideBackAction({
        overlayOpen: !!document.querySelector(OPEN_OVERLAY_SELECTOR),
        canGoBack,
        atTabRoot: isTabRoot(chrome.activeTab ?? undefined, route.path),
        atHome: isTabRoot(home, route.path),
        hasTabs: chrome.tabs.length > 0,
      })
      if (action === 'close-overlay') {
        // Nuxt UI (Reka) closes the topmost overlay on Escape.
        const target = document.activeElement ?? document.body
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      }
      else if (action === 'back') router.back()
      else if (action === 'home' && home) await nuxtApp.runWithContext(() => navigateTo(home.to, { replace: true }))
      else await app.minimizeApp()
    })
  },
})
