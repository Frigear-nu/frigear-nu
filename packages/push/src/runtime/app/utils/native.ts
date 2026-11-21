// The parts of `@capacitor/push-notifications` and `@capacitor-firebase/messaging` this module uses, as structural
// types: the module type-checks and builds without either (optional) plugin installed, and `#push/native` only imports
// the one that is.

import type { PushProvider } from '../../../types'

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

/** `@capacitor-firebase/messaging`: hands out the FCM token on Android and on iOS. */
export interface FirebaseMessagingPluginLike {
  checkPermissions: () => Promise<{ receive: PermissionState }>
  requestPermissions: () => Promise<{ receive: PermissionState }>
  getToken: () => Promise<{ token: string }>
  deleteToken: () => Promise<void>
  addListener: ((event: 'tokenReceived', listener: (event: { token: string }) => void) => Promise<ListenerHandle>)
    & ((event: 'notificationActionPerformed', listener: (event: { notification: { data?: unknown } }) => void) => Promise<ListenerHandle>)
}

export type NativePush = {
  plugin: PushNotificationsPluginLike
  /** `Capacitor.getPlatform()`: `ios`, `android` or `web`. */
  platform: string
  /** Who issued the token the plugin hands out, sent with the registration so the server knows where to push. */
  provider: PushProvider
}

/** What `#push/native` exports: a lazy loader, or `null` when no push plugin is installed. */
export type NativePushLoader = (() => Promise<NativePush>) | null

/**
 * The provider of a `@capacitor/push-notifications` token: the APNs device token on iOS, the FCM token elsewhere.
 * `@capacitor-firebase/messaging` always hands out an FCM token.
 */
export const capacitorPushProvider = (platform: string): PushProvider => platform === 'ios' ? 'apns' : 'fcm'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const adapters = new WeakMap<FirebaseMessagingPluginLike, PushNotificationsPluginLike>()

/**
 * `@capacitor-firebase/messaging` behind the interface of `@capacitor/push-notifications`, so one device flow serves
 * both. `register()` gets the FCM token and hands it to the `registration` listeners (on every call, like the
 * Capacitor plugin); a token Firebase rotates later (`tokenReceived`) is handed on only when it differs from the last
 * one. A failing `getToken()` rejects `register()`. One adapter per plugin: the loader runs on every call, and the
 * listeners must stay on the adapter the device flow subscribed to.
 */
export function fromFirebaseMessaging(plugin: FirebaseMessagingPluginLike): PushNotificationsPluginLike {
  let adapter = adapters.get(plugin)
  if (!adapter) {
    adapter = adaptFirebaseMessaging(plugin)
    adapters.set(plugin, adapter)
  }
  return adapter
}

function adaptFirebaseMessaging(plugin: FirebaseMessagingPluginLike): PushNotificationsPluginLike {
  const listeners = new Set<(token: { value: string }) => void>()
  let last: string | undefined
  let watching: Promise<unknown> | undefined

  const emit = (token: string) => {
    last = token
    for (const listener of listeners) listener({ value: token })
  }
  const handle = (remove: () => void): ListenerHandle => ({
    remove: async () => remove(),
  })

  const addListener = async (event: string, listener: (value: never) => void): Promise<ListenerHandle> => {
    if (event === 'registration') {
      const typed = listener as (token: { value: string }) => void
      listeners.add(typed)
      return handle(() => listeners.delete(typed))
    }
    // Errors reject `register()` instead.
    if (event === 'registrationError') return handle(() => {})
    return plugin.addListener('notificationActionPerformed', ({ notification }) => {
      (listener as (action: { notification: { data?: Record<string, unknown> } }) => void)({ notification: { data: isRecord(notification.data) ? notification.data : undefined } })
    })
  }

  return {
    checkPermissions: () => plugin.checkPermissions(),
    requestPermissions: () => plugin.requestPermissions(),
    async register() {
      watching ??= plugin.addListener('tokenReceived', ({ token }) => {
        if (token && token !== last) emit(token)
      })
      await watching
      const { token } = await plugin.getToken()
      if (!token) throw new Error('Firebase Messaging handed out no token.')
      emit(token)
    },
    async unregister() {
      last = undefined
      await plugin.deleteToken()
    },
    addListener: addListener as PushNotificationsPluginLike['addListener'],
  }
}

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
