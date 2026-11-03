import { defineNuxtPlugin, navigateTo, useRuntimeConfig } from '#imports'
import { useOAuth } from '#mobile/optional'
import type { MobileDeepLinkContext } from '../../../types'
import { classifyDeepLink } from '../../shared/deep-links'
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
      if (!prevented) await nuxtApp.runWithContext(() => navigateTo(ctx.path))
    }

    await app.addListener('appUrlOpen', ({ url }) => void open(url))
    // Cold start: the link that launched the app, once the router is ready.
    const launch = await app.getLaunchUrl().catch(() => undefined)
    if (launch?.url) nuxtApp.hook('app:mounted', () => void open(launch.url))
  },
})
