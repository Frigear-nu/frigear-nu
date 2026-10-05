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

const nuxtUiDriver = defineUIDriver((notification) => {
  useToast().add({
    title: notification.title,
    description: notification.text,
    color: COLOR_BY_TYPE[notification?.type ?? 'info'],
    actions: notification?.actions as ToastOptions['actions'],
  })
})

export default nuxtUiDriver
