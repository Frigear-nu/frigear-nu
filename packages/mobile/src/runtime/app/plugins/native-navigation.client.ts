import { defineNuxtPlugin, navigateTo, useColorMode, useRouter, watch } from '#imports'
import { createNativeNavigationController } from '../../shared/native-navigation'
import { useCapacitor } from '../composables/useCapacitor'
import { useMobileChrome } from '../composables/useMobileChrome'
import { useMobileTabs } from '../composables/useMobileTabs'

/**
 * On iOS (and Android with `nativeChrome: 'all'`) the native navbar and tab bar of `@capgo/capacitor-native-navigation`
 * replace `MobileHeader` / `MobileTabBar`. Routing stays in Nuxt: a native tap navigates, and the bars follow the
 * route, the sign-in state, open overlays and the colour mode (the bars follow the system appearance otherwise).
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

    const router = useRouter()
    const colorMode = useColorMode()
    const { label } = useMobileTabs()
    const controller = createNativeNavigationController({
      plugin,
      label,
      onSelectTab: async (tab) => {
        await nuxtApp.runWithContext(() => navigateTo(tab.to))
      },
      onBack: () => router.back(),
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
