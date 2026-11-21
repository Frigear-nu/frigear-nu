// The parts of `@capacitor/push-notifications` this module uses, as structural types: the module type-checks and builds
// without the (optional) plugin installed, and `#push/native` only imports it when it is.

export type PermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'

export interface ListenerHandle {
  remove: () => Promise<void>
}

export interface PushNotificationsPluginLike {
  checkPermissions: () => Promise<{ receive: PermissionState }>
  requestPermissions: () => Promise<{ receive: PermissionState }>
  /** Starts the registration with APNs (iOS) or FCM (Android); the token arrives in the `registration` event. */
  register: () => Promise<void>
  unregister: () => Promise<void>
  addListener: ((event: 'registration', listener: (token: { value: string }) => void) => Promise<ListenerHandle>)
    & ((event: 'registrationError', listener: (error: { error: string }) => void) => Promise<ListenerHandle>)
    & ((event: 'pushNotificationActionPerformed', listener: (action: { notification: { data?: Record<string, unknown> } }) => void) => Promise<ListenerHandle>)
}

export type NativePush = {
  plugin: PushNotificationsPluginLike
  /** `Capacitor.getPlatform()`: `ios`, `android` or `web`. */
  platform: string
}

/** What `#push/native` exports: a lazy loader, or `null` when the plugin is not installed. */
export type NativePushLoader = (() => Promise<NativePush>) | null

/**
 * A Capacitor plugin is a proxy that answers every property, `then` included, so a promise resolved with it calls the
 * native `then()`, which rejects as not implemented and never settles. Wrap it before returning it from a promise
 * (the same idea as `withoutThen` in `@frigear-nu/mobile`).
 */
export function withoutThen<T extends object>(plugin: T): T {
  return new Proxy(plugin, {
    get: (target, key, receiver) => (key === 'then' ? undefined : Reflect.get(target, key, receiver)),
  })
}

/** Whether a notification's `url` is a path inside the app (never a scheme-relative or absolute URL). */
export function isInAppPath(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
}
