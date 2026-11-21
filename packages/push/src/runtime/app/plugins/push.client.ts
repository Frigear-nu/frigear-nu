import { defineNuxtPlugin, useRuntimeConfig, useUserSession, watch } from '#imports'
import { usePushDevice } from '../composables/usePushDevice'

// Registers this device for push notifications as soon as someone is signed in: on a fresh sign-in and when a stored
// session is restored at startup (`auth:signed-in` does not fire for that, so this watches the session instead).
// Only added when `@frigear-nu/mobile` is installed. Sign-out is not handled here: the credentials are gone by then, so
// the app calls `usePushDevice().unregister()` before `useAuth().logout()`.
export default defineNuxtPlugin({
  name: 'push',
  setup() {
    const config = useRuntimeConfig().public.push as { autoRegister?: boolean } | undefined
    if (config?.autoRegister === false) return

    const push = usePushDevice()
    if (!push.supported) return

    const { loggedIn } = useUserSession()
    watch(loggedIn, (signedIn) => {
      if (!signedIn) return
      push.register().catch(error => console.warn('[@frigear-nu/push] Registering the device failed:', error))
    }, { immediate: true })
  },
})
