import { useToast } from '#imports'
import { defineUIDriver } from '../../server/utils/definers'

const COLOR_BY_TYPE = {
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
} as const

// `useToast().add()`'s `actions` option is typed against `@nuxt/ui`'s own `ButtonProps`, which
// isn't re-exported from the package's public entrypoint - derive it from `useToast` itself
// rather than reaching into `@nuxt/ui`'s internals.
type ToastOptions = Parameters<ReturnType<typeof useToast>['add']>[0]

// `useToast()` relies on Vue's `inject()` under the hood, which only works while a component is
// being set up. `UIDriver` is a composable factory for exactly this reason - `useNotify()` calls
// it once, synchronously, during its own setup-time invocation, so `useToast()` resolves
// correctly here, and the returned function is simply reused for every notification dispatched
// afterwards (even from async contexts, e.g. a `setInterval` callback).
const nuxtUiDriver = defineUIDriver(() => {
  const toast = useToast()

  return (notification) => {
    toast.add({
      title: notification.title,
      description: notification.text,
      color: COLOR_BY_TYPE[notification?.type ?? 'info'],
      actions: notification?.actions as ToastOptions['actions'],
    })
  }
})

export default nuxtUiDriver
