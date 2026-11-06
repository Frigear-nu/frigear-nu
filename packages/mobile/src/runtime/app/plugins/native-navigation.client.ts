import { defineNuxtPlugin, navigateTo, nextTick, useColorMode, useRouter, useRuntimeConfig, watch } from '#imports'
import { createNativeNavigationController } from '../../shared/native-navigation'
import { navigateWhenReady, type PageReadyContext } from '../../shared/page-ready'
import { useCapacitor } from '../composables/useCapacitor'
import { useMobileChrome } from '../composables/useMobileChrome'
import { useMobileTabs } from '../composables/useMobileTabs'
import { useMobileBack } from '../utils/back'
import { runNavbarAction } from '../utils/navbar-actions'

/**
 * On iOS (and Android with `nativeChrome: 'all'`) the native navbar and tab bar of `@capgo/capacitor-native-navigation`
 * replace `MobileHeader` / `MobileTabBar`. Routing stays in Nuxt: a native tap navigates, and the bars follow the
 * route, the sign-in state, open overlays and the colour mode (the bars follow the system appearance otherwise). A tap on
 * a navbar action runs the page's `onSelect` / `to`.
 */
export default defineNuxtPlugin({
  name: 'mobile:native-navigation',
  dependsOn: ['mobile'],
  async setup(nuxtApp) {
    const { state } = useMobileChrome()
    if (state.value.mode !== 'native') return
    const capacitor = useCapacitor()
    const plugin = await capacitor.load('nativeNavigation')
    if (!plugin) return

    const colorMode = useColorMode()
    const { label } = useMobileTabs()
    const back = useMobileBack(() => state.value)
    const router = useRouter()
    const page: PageReadyContext = {
      onPageLoaded: listener => nuxtApp.hook('page:loading:end', listener),
      currentPath: () => router.currentRoute.value.fullPath,
      // The route watchers (chrome state, scroll restore) run, then the browser paints.
      settle: () => nextTick().then(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))),
    }
    const controller = createNativeNavigationController({
      plugin,
      label,
      tabTransitionDuration: useRuntimeConfig().public.mobile.tabTransitionDuration,
      // Resolves once the new page has rendered with its data, so the crossfade never shows a half-built tab.
      onSelectTab: tab => navigateWhenReady(page, () => nuxtApp.runWithContext(() => navigateTo(tab.to))),
      onBack: async () => {
        await nuxtApp.runWithContext(() => back())
      },
      onAction: action => runNavbarAction(action, to => router.push(to)),
    })
    try {
      await controller.start()
    }
    catch (error) {
      console.error('[@frigear-nu/mobile] Native navigation failed to start:', error)
      return
    }

    watch([state, () => colorMode.value], ([chrome, mode]) => {
      controller.apply(chrome, { foreground: mode === 'dark' ? '#FFFFFF' : '#0F172A' })
        .catch(error => console.error('[@frigear-nu/mobile] Native navigation:', error))
    }, { immediate: true, deep: true })
  },
})
