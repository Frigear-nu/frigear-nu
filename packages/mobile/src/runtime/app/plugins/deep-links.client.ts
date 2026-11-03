import { defineNuxtPlugin, navigateTo, useRuntimeConfig } from '#imports'
import { useOAuth } from '#mobile/optional'
import type { MobileDeepLinkContext } from '../../../types'
import { classifyDeepLink, isInAppPath } from '../../shared/deep-links'
import { useCapacitor } from '../composables/useCapacitor'

/**
 * Routes the URLs the OS opens the app with (custom schemes, universal links of `deepLinks.hosts`) to app pages, on a
 * cold start and while running. OAuth callbacks are left to `@frigear-nu/oauth-client`. The `mobile:deep-link` hook
 * can change the path or handle the link itself.
 */
export default defineNuxtPlugin({
  name: 'mobile:deep-links',
  dependsOn: ['mobile'],
  async setup(nuxtApp) {
    const capacitor = useCapacitor()
    const app = await capacitor.load('app')
    if (!app) return
    const config = useRuntimeConfig().public.mobile
    const oauth = typeof useOAuth === 'function' ? useOAuth() : undefined

    const open = async (url: string) => {
      const link = classifyDeepLink(url, {
        schemes: config.deepLinks.schemes,
        hosts: config.deepLinks.hosts,
        isCallbackUrl: oauth ? candidate => oauth.isCallbackUrl(candidate) : undefined,
      })
      if (link.type !== 'route') return
      let prevented = false
      const ctx: MobileDeepLinkContext = { url, path: link.path, preventDefault: () => (prevented = true) }
      await nuxtApp.callHook('mobile:deep-link', ctx)
      if (prevented) return
      // A hook may have changed the path: only ever navigate within the app.
      if (!isInAppPath(ctx.path)) {
        console.warn('[@frigear-nu/mobile] Ignored a deep link to a path outside the app:', ctx.path)
        return
      }
      await nuxtApp.runWithContext(() => navigateTo(ctx.path))
    }
    const handle = (url: string) => open(url).catch(error => console.error('[@frigear-nu/mobile] Deep link failed:', error))

    // iOS also delivers the launch URL as `appUrlOpen`: the cold-start path below skips a URL the event already opened.
    let starting = true
    const openedWhileStarting = new Set<string>()
    await app.addListener('appUrlOpen', ({ url }) => {
      if (starting) openedWhileStarting.add(url)
      void handle(url)
    })
    // Cold start: the link that launched the app, once the router is ready.
    const launch = await app.getLaunchUrl().catch(() => undefined)
    nuxtApp.hook('app:mounted', () => {
      starting = false
      if (launch?.url && !openedWhileStarting.has(launch.url)) void handle(launch.url)
      openedWhileStarting.clear()
    })
  },
})
