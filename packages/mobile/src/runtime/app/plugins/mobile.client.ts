import { defineNuxtPlugin, onNuxtReady, preloadRouteComponents, useColorMode, useRouter, useRuntimeConfig, watch } from '#imports'
import type { MobilePageMeta } from '../../../types'
import { OPEN_OVERLAY_SELECTOR } from '../../shared/chrome'
import { tabRootAt } from '../../shared/tabs'
import { useCapacitor } from '../composables/useCapacitor'
import { useMobileChrome } from '../composables/useMobileChrome'
import { useNative } from '../composables/useNative'
import { useOverlayCount } from '../utils/state'

/**
 * The shell's client side: classes on `<html>` for the insets CSS, the open-overlay count, `:active` states on iOS,
 * tab pages kept alive and preloaded, switch haptics, the keyboard accessory bar and a status bar that follows the
 * colour mode.
 */
export default defineNuxtPlugin({
  name: 'mobile',
  setup(nuxtApp) {
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

    const router = useRouter()
    const tabRoot = (path: string, meta: { mobile?: unknown }) => tabRootAt(state.value.tabs, path, (meta.mobile as MobilePageMeta | undefined)?.tab)

    if (config.keepTabsAlive) {
      // Like a native tab bar: each tab's own page stays mounted and scrolled where it was left. `NuxtPage` keeps a
      // page alive when its route meta says so; a page's own `keepalive: false` wins.
      const scroll = new Map<string, number>()
      let restore: number | undefined
      router.beforeEach((to, from) => {
        if (tabRoot(from.path, from.meta)) scroll.set(from.path, window.scrollY)
        restore = undefined
        if (!tabRoot(to.path, to.meta)) return
        to.meta.keepalive ??= true
        const saved = scroll.get(to.path)
        if (to.meta.keepalive && saved !== undefined && to.path !== from.path) {
          to.meta.scrollToTop = false
          restore = saved
        }
      })
      // Before the page shows (and under the native crossfade), so the page never jumps.
      nuxtApp.hook('page:loading:end', () => {
        if (restore === undefined) return
        window.scrollTo({ top: restore, behavior: 'instant' })
        restore = undefined
      })
    }

    // Load every tab's page code up front, so switching never waits for a chunk.
    onNuxtReady(() => {
      watch(() => state.value.tabs.map(tab => tab.to).join('\n'), (paths) => {
        for (const path of paths.split('\n').filter(Boolean)) void preloadRouteComponents(path).catch(() => {})
      }, { immediate: true })
    })

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
