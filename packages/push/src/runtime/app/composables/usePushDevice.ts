import { loadPushNotifications } from '#push/native'
import { createPushDevice } from '../utils/device'
import type { PushDeviceActions, PushDeviceDeps, PushPermission } from '../utils/device'
import { $fetch, navigateTo, readonly, useNuxtApp, useRuntimeConfig, useState } from '#imports'

const TOKEN_KEY = 'frigear-push-token'

const storage = {
  get: () => {
    try {
      return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null
    }
    catch {
      return null
    }
  },
  set: (token: string | null) => {
    try {
      if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token)
      else globalThis.localStorage?.removeItem(TOKEN_KEY)
    }
    catch {
      // Storage is not available: unregister() then only works within this launch.
    }
  },
}

// One device flow per app: it owns the native listeners, which must only be added once.
const flows = new WeakMap<object, PushDeviceActions>()

/**
 * Push notifications of this device, for a Capacitor app (`@frigear-nu/mobile` with `@capacitor-firebase/messaging`,
 * which registers the FCM token on iOS too, or `@capacitor/push-notifications`, which registers the APNs token there).
 * The sign-in plugin registers automatically (`push.settings.autoRegister`); use this to ask at a better moment, to
 * show the permission state, and to unregister.
 *
 * Call `unregister()` **before** `useAuth().logout()`: the server removes the device with the signed-in user's
 * credentials, which are gone once the logout is done (then it answers 401 and the device stays registered).
 *
 * Web push is not supported: outside a native app `supported` is `false` and `register()` resolves `false`.
 */
export function usePushDevice() {
  const nuxtApp = useNuxtApp()
  const permission = useState<PushPermission>('push:permission', () => 'unknown')
  const token = useState<string | null>('push:token', () => null)
  const registered = useState<boolean>('push:registered', () => false)

  let flow = flows.get(nuxtApp)
  if (!flow) {
    // Read when used: the plugins that provide `$api` and `$i18n` may run after the one that creates this flow.
    const provided = () => nuxtApp as unknown as {
      $api?: PushDeviceDeps['request']
      $i18n?: { locale: { value: string } }
    }
    flow = createPushDevice({
      load: loadPushNotifications,
      // `$api` (bearer token) in client mode, the cookie session otherwise.
      request: (path, options) => (provided().$api ?? ($fetch as PushDeviceDeps['request']))(path, options),
      state: { permission, token, registered },
      appId: (useRuntimeConfig().public.mobile as { appId?: string } | undefined)?.appId,
      locale: () => provided().$i18n?.locale.value,
      storage,
      // A native listener runs outside the Nuxt context.
      navigate: path => void nuxtApp.runWithContext(() => navigateTo(path)),
    })
    flows.set(nuxtApp, flow)
  }

  return {
    /** Whether this build can receive pushes: a native app with a push plugin installed. */
    supported: loadPushNotifications !== null,
    permission: readonly(permission),
    token: readonly(token),
    /** Whether this device's token is known to the server. */
    registered: readonly(registered),
    /** Asks for permission when needed, registers with APNs / FCM and tells the server. Resolves `false` without permission. */
    register: flow.register,
    /** Removes this device on the server and forgets the token. Call it before `useAuth().logout()`. */
    unregister: flow.unregister,
  }
}
