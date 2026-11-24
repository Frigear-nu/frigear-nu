import { defineNuxtPlugin, navigateTo, useRuntimeConfig } from '#imports'
import { useAuth } from '#desktop/optional'
import type { DesktopDeepLinkContext } from '../../../types'
import { classifyDeepLink, isInAppPath } from '../../shared/deep-links'
import { useDesktop } from '../composables/useDesktop'

/**
 * Routes the URLs the OS opens the app with (`deepLinks.schemes`) to app pages, on a cold start and while running.
 * OAuth callbacks are left to `@frigear-nu/auth`; `deepLinks.focusPath` only focuses the window. The `desktop:deep-link`
 * hook can change the path or handle the link.
 */
export default defineNuxtPlugin({
  name: 'desktop:deep-links',
  dependsOn: ['desktop'],
  async setup(nuxtApp) {
    const desktop = useDesktop()
    const deepLink = await desktop.load('deepLink')
    if (!deepLink) return
    const config = useRuntimeConfig().public.desktop
    const auth = typeof useAuth === 'function' ? useAuth() : undefined

    const open = async (url: string) => {
      const link = classifyDeepLink(url, {
        schemes: config.deepLinks.schemes,
        isCallbackUrl: auth ? candidate => auth.isCallbackUrl(candidate) : undefined,
        focusPath: config.deepLinks.focusPath || undefined,
      })
      // The browser's "signed in" page of Auth's frigear handoff: only bring the window forward. The window collects
      // the session itself; the link carries nothing.
      if (link.type === 'focus') return desktop.focus()
      if (link.type !== 'route') return
      let prevented = false
      const ctx: DesktopDeepLinkContext = { url, path: link.path, preventDefault: () => (prevented = true) }
      await nuxtApp.callHook('desktop:deep-link', ctx)
      if (prevented) return
      // A hook may have changed the path: only ever navigate within the app.
      if (!isInAppPath(ctx.path)) {
        console.warn('[@frigear-nu/desktop] Ignored a deep link to a path outside the app:', ctx.path)
        return
      }
      await nuxtApp.runWithContext(() => navigateTo(ctx.path))
    }
    const handle = (url: string) => open(url).catch(error => console.error('[@frigear-nu/desktop] Deep link failed:', error))

    await deepLink.onOpenUrl(urls => urls.forEach(url => void handle(url)))
    // Cold start: the links the app was started with, once the router is ready. `getCurrent()` keeps returning them
    // after a reload of the webview, so only the first load of this window handles them.
    const launch = (await deepLink.getCurrent().catch(() => null)) ?? []
    const key = 'frigear-desktop:launch-links'
    let handled: string | null = null
    try {
      handled = sessionStorage.getItem(key)
      sessionStorage.setItem(key, JSON.stringify(launch))
    }
    catch {
      // No sessionStorage: handle them every load.
    }
    nuxtApp.hook('app:mounted', () => {
      if (handled === JSON.stringify(launch)) return
      for (const url of launch) void handle(url)
    })
  },
})
