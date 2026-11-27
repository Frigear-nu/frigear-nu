import { defineNuxtPlugin, useRouter, useRuntimeConfig } from '#imports'
import { classifyLink, originOf } from '../../shared/host'
import { useMobileHost } from '../composables/useMobileHost'

/**
 * `mobile.host`: what the app has no page for opens on the website in the in-app browser. A navigation to a path
 * without a page (a module's link to a website-only page, a deep link) opens that path there, and so does a tap on a
 * link to the website or to another site.
 */
export default defineNuxtPlugin({
  name: 'mobile:host',
  dependsOn: ['mobile'],
  setup() {
    const config = useRuntimeConfig().public.mobile.host
    const host = useMobileHost()
    if (!host.enabled) {
      console.warn('[@frigear-nu/mobile] `mobile.host` has no URL: set it, or the issuer of `@frigear-nu/auth` in client mode.')
      return
    }
    const router = useRouter()
    const open = (target: string) => host.open(target).catch(error => console.error('[@frigear-nu/mobile] Opening the website failed:', error))

    if (config.routes) {
      router.beforeEach((to, from) => {
        if (to.matched.length) return
        void open(to.fullPath)
        // Stay where we are; the first navigation of the app (a cold start on such a path) has nowhere to stay.
        if (from.matched.length) return false
        return to.path === '/' ? false : '/'
      })
    }

    if (config.links) {
      const appOrigin = originOf(globalThis.location)
      const hostOrigin = originOf(new URL(host.base))
      // Capture phase: before `NuxtLink` (or the WebView) handles the tap.
      document.addEventListener('click', (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
        if (!anchor || anchor.hasAttribute('download')) return
        const href = anchor.getAttribute('href') ?? ''
        const kind = classifyLink(href, { app: appOrigin, host: hostOrigin })
        let target: string
        if (kind === 'host' || kind === 'external') {
          target = anchor.href
        }
        else if (kind === 'app' && config.routes) {
          // A link to a page the app does not have (also a plain `<a>`, which would reload the app) opens on the website.
          const url = new URL(href, appOrigin)
          const path = `${url.pathname}${url.search}${url.hash}`
          if (router.resolve(path).matched.length) return
          target = path
        }
        else {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        void open(target)
      }, { capture: true })
    }
  },
})
