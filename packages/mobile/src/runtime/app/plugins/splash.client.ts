import { defineComponent, h, render, Transition } from 'vue'
import { defineNuxtPlugin, useRuntimeConfig } from '#imports'
import SplashScreen from '#mobile/splash'
import { createSplashController } from '../../shared/splash'
import { useCapacitor } from '../composables/useCapacitor'
import { splashControllers } from '../utils/splash'
import { useSplashVisible } from '../utils/state'

/**
 * Mounts the splash screen into `<body>` before the first page renders, outside `app.vue` and the layouts, and hides
 * it once the first page has rendered and nothing holds it (`useMobileSplash()`). On a device it takes over from the
 * native launch screen: that one hides as soon as this one has painted.
 */
export default defineNuxtPlugin({
  name: 'mobile:splash',
  enforce: 'pre',
  setup(nuxtApp) {
    const config = useRuntimeConfig().public.mobile.splashScreen
    const visible = useSplashVisible()
    visible.value = true

    const controller = createSplashController({
      minDuration: config.minDuration,
      maxDuration: config.maxDuration,
      onHide: () => {
        visible.value = false
      },
    })
    splashControllers.set(nuxtApp, controller)

    // The first page's render is the built-in hold.
    const releaseFirstRender = controller.hold()
    nuxtApp.hooks.hookOnce('app:suspense:resolve', releaseFirstRender)
    nuxtApp.hooks.hookOnce('page:finish', releaseFirstRender)
    nuxtApp.hooks.hookOnce('app:error', releaseFirstRender)

    const el = document.createElement('div')
    el.id = 'mobile-splash'
    document.body.appendChild(el)
    const unmount = () => {
      render(null, el)
      el.remove()
    }
    const Host = defineComponent({
      name: 'MobileSplashHost',
      setup: () => () => h(Transition, { name: 'mobile-splash', appear: false, onAfterLeave: unmount }, () => (visible.value ? h(SplashScreen) : null)),
    })
    const vnode = h(Host)
    // The app's context: its components, plugins (i18n) and `useNuxtApp()` work inside the splash screen.
    vnode.appContext = nuxtApp.vueApp._context
    render(vnode, el)

    const capacitor = useCapacitor()
    if (config.native && capacitor.isNative) {
      // Two frames: the splash screen is on screen before the native launch screen goes.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        void capacitor.load('splashScreen').then(plugin => plugin?.hide({ fadeOutDuration: 0 })).catch(() => {})
      }))
    }
  },
})
