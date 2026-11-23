import { defineNuxtPlugin } from '#imports'
import { useDesktop } from '../composables/useDesktop'

/** `@frigear-nu/auth`'s `FrigearHandoffOpenContext`, repeated so the module builds without Auth's generated types. */
interface FrigearHandoffOpenContext {
  url: string
  handled: boolean
}

/**
 * Local mode with server auth: "Log in with frigear.nu" (Auth's `oauth.frigear.handoff`) opens frigear.nu in the system
 * browser through `@tauri-apps/plugin-opener`, where passkeys work, instead of a window inside the webview. Outside the
 * desktop app, or without the opener, Auth's default (`window.open`) stays.
 */
export default defineNuxtPlugin({
  name: 'desktop:frigear-handoff',
  dependsOn: ['desktop'],
  setup(nuxtApp) {
    const desktop = useDesktop()
    if (!desktop.isDesktop || !desktop.has('opener')) return
    // Typed by Auth's generated `auth:frigear:open` hook; registered loosely so this file needs no generated types.
    const hook = nuxtApp.hook as unknown as (name: string, fn: (ctx: FrigearHandoffOpenContext) => Promise<void>) => void
    hook('auth:frigear:open', async (ctx) => {
      if (ctx.handled) return
      const opener = await desktop.load('opener')
      if (!opener) return
      try {
        await opener.openUrl(ctx.url)
        ctx.handled = true
      }
      catch (error) {
        // Refused by the capability, or no default browser: Auth falls back to `window.open`.
        console.error('[@frigear-nu/desktop] Could not open the system browser for "Log in with frigear.nu":', error)
      }
    })
  },
})
