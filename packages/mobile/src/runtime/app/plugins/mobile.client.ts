import { defineNuxtPlugin, useColorMode, useRuntimeConfig, watch } from '#imports'
import { OPEN_OVERLAY_SELECTOR } from '../../shared/chrome'
import { useCapacitor } from '../composables/useCapacitor'
import { useMobileChrome } from '../composables/useMobileChrome'
import { useNative } from '../composables/useNative'
import { useOverlayCount } from '../utils/state'

/**
 * The shell's client side: classes on `<html>` for the insets CSS, the open-overlay count, `:active` states on iOS,
 * switch haptics, the keyboard accessory bar and a status bar that follows the colour mode.
 */
export default defineNuxtPlugin({
  name: 'mobile',
  setup() {
    const config = useRuntimeConfig().public.mobile
    const capacitor = useCapacitor()
    const { state } = useMobileChrome()
    const overlays = useOverlayCount()
    const root = document.documentElement

    root.classList.add(`mobile-platform-${capacitor.platform}`)
    watch(() => [state.value.mode, state.value.tabBar.visible] as const, ([mode, tabBar]) => {
      root.classList.toggle('mobile-chrome-native', mode === 'native')
      root.classList.toggle('mobile-chrome-web', mode === 'web')
      root.classList.toggle('mobile-has-tabbar', tabBar)
    }, { immediate: true })

    // Nuxt UI portals overlays into <body> and flips `data-state` as they open and close.
    const count = () => {
      const open = document.querySelectorAll(OPEN_OVERLAY_SELECTOR).length
      if (open !== overlays.value) overlays.value = open
    }
    new MutationObserver(count).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] })
    count()

    // WebKit on iOS only applies `:active` while a touch listener exists, so pressed states never show without one.
    document.addEventListener('touchstart', () => {}, { passive: true })

    if (!capacitor.isNative) return
    const native = useNative()

    if (config.native.switchHaptics) {
      document.addEventListener('click', (event) => {
        if ((event.target as Element | null)?.closest?.('[role="switch"]')) void native.haptic('selection')
      })
    }

    if (config.native.keyboardAccessoryBar && capacitor.isIos) {
      // The bar has Done, which number pads otherwise lack.
      void capacitor.load('keyboard').then(keyboard => keyboard?.setAccessoryBarVisible({ isVisible: true })).catch(() => {})
    }

    if (config.native.statusBar) {
      const colorMode = useColorMode()
      // The status bar follows the system appearance, not the app's: `DARK` is light text for a dark page.
      void capacitor.load('statusBar').then((statusBar) => {
        if (!statusBar) return
        watch(() => colorMode.value, mode => statusBar.setStyle({ style: mode === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {}), { immediate: true })
      }).catch(() => {})
    }
  },
})
