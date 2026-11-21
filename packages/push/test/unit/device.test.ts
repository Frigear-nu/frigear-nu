import { describe, expect, it, vi } from 'vitest'
import type { Ref } from 'vue'
import { createPushDevice } from '../../src/runtime/app/utils/device'
import type { PushDeviceState } from '../../src/runtime/app/utils/device'
import { capacitorPushProvider, fromFirebaseMessaging, isInAppPath, withoutThen } from '../../src/runtime/app/utils/native'
import type { FirebaseMessagingPluginLike, PermissionState, PushNotificationsPluginLike } from '../../src/runtime/app/utils/native'
import { detectNativePushPlugin, nativeLoaderTemplate } from '../../src/build'

type Listeners = { registration?: (token: { value: string }) => void, registrationError?: (error: { error: string }) => void, pushNotificationActionPerformed?: (action: { notification: { data?: Record<string, unknown> } }) => void }

function fakePlugin(options: { permission?: PermissionState, afterPrompt?: PermissionState, token?: string | null } = {}) {
  const listeners: Listeners = {}
  const calls: string[] = []
  let permission = options.permission ?? 'prompt'
  const plugin = {
    checkPermissions: async () => ({ receive: permission }),
    requestPermissions: async () => {
      calls.push('requestPermissions')
      permission = options.afterPrompt ?? 'granted'
      return { receive: permission }
    },
    register: async () => {
      calls.push('register')
      if (options.token !== null) queueMicrotask(() => listeners.registration?.({ value: options.token ?? 'token-1' }))
    },
    unregister: async () => {
      calls.push('unregister')
    },
    addListener: async (event: keyof Listeners, listener: never) => {
      calls.push(`listen:${event}`)
      listeners[event] = listener
      return { remove: async () => {} }
    },
  } as unknown as PushNotificationsPluginLike
  return { plugin, listeners, calls }
}

const ref = <T>(value: T) => ({ value }) as Ref<T>
const state = (): PushDeviceState => ({ permission: ref('unknown'), token: ref(null), registered: ref(false) })

function setup(plugin: ReturnType<typeof fakePlugin>, overrides: Partial<Parameters<typeof createPushDevice>[0]> = {}) {
  const requests: Array<{ path: string, body: unknown }> = []
  const navigated: string[] = []
  const stored: { token: string | null } = { token: null }
  const deviceState = state()
  const device = createPushDevice({
    load: async () => ({ plugin: plugin.plugin, platform: 'android', provider: 'fcm' }),
    request: async (path, options) => {
      requests.push({ path, body: options.body })
    },
    state: deviceState,
    appId: 'com.example.app',
    locale: () => 'da',
    storage: { get: () => stored.token, set: (token) => { stored.token = token } },
    navigate: path => navigated.push(path),
    log: { warn: vi.fn() },
    ...overrides,
  })
  return { device, requests, navigated, stored, deviceState }
}

describe('createPushDevice', () => {
  it('asks for permission, registers with the OS and tells the server the token', async () => {
    const plugin = fakePlugin()
    const { device, requests, stored, deviceState } = setup(plugin)
    expect(await device.register()).toBe(true)
    expect(plugin.calls).toEqual(['requestPermissions', 'listen:registration', 'listen:registrationError', 'listen:pushNotificationActionPerformed', 'register'])
    expect(requests).toEqual([{ path: '/api/push/me/devices', body: { platform: 'android', provider: 'fcm', token: 'token-1', appId: 'com.example.app', locale: 'da' } }])
    expect(stored.token).toBe('token-1')
    expect(deviceState).toMatchObject({ permission: { value: 'granted' }, token: { value: 'token-1' }, registered: { value: true } })
  })

  it('does not ask again once permission is granted and listens only once', async () => {
    const plugin = fakePlugin({ permission: 'granted' })
    const { device, requests } = setup(plugin)
    await device.register()
    await device.register()
    expect(plugin.calls.filter(call => call === 'requestPermissions')).toHaveLength(0)
    expect(plugin.calls.filter(call => call.startsWith('listen:'))).toHaveLength(3)
    expect(requests).toHaveLength(2)
  })

  it('stops without registering when permission is denied', async () => {
    const plugin = fakePlugin({ permission: 'denied' })
    const { device, requests, deviceState } = setup(plugin)
    expect(await device.register()).toBe(false)
    expect(plugin.calls).toEqual([])
    expect(requests).toEqual([])
    expect(deviceState.permission.value).toBe('denied')

    const refused = fakePlugin({ permission: 'prompt', afterPrompt: 'denied' })
    expect(await setup(refused).device.register()).toBe(false)
    expect(refused.calls).toEqual(['requestPermissions'])
  })

  it('is unsupported without the plugin and on the web', async () => {
    const withoutPlugin = setup(fakePlugin(), { load: null })
    expect(await withoutPlugin.device.register()).toBe(false)
    expect(withoutPlugin.deviceState.permission.value).toBe('unsupported')

    const web = setup(fakePlugin(), { load: async () => ({ plugin: fakePlugin().plugin, platform: 'web', provider: 'fcm' }) })
    expect(await web.device.register()).toBe(false)
    expect(web.requests).toEqual([])
  })

  it('rejects when the OS hands out no token in time or reports an error', async () => {
    const silent = setup(fakePlugin({ permission: 'granted', token: null }), { tokenTimeoutMs: 20 })
    await expect(silent.device.register()).rejects.toThrow(/did not hand out/)

    const failing = fakePlugin({ permission: 'granted', token: null })
    const result = setup(failing)
    const pending = result.device.register()
    await vi.waitFor(() => expect(failing.listeners.registrationError).toBeDefined())
    await vi.waitFor(() => expect(failing.calls).toContain('register'))
    failing.listeners.registrationError!({ error: 'no network' })
    await expect(pending).rejects.toThrow('no network')
  })

  it('sends a rotated token to the server while registered', async () => {
    const plugin = fakePlugin({ permission: 'granted' })
    const { device, requests } = setup(plugin)
    await device.register()
    plugin.listeners.registration!({ value: 'token-2' })
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]!.body).toMatchObject({ token: 'token-2' })
  })

  it('shares one registration between overlapping calls', async () => {
    const plugin = fakePlugin({ permission: 'granted' })
    const { device, requests } = setup(plugin)
    const results = await Promise.all([device.register(), device.register(), device.register()])
    expect(results).toEqual([true, true, true])
    expect(plugin.calls.filter(call => call === 'register')).toHaveLength(1)
    expect(requests).toHaveLength(1)
    // Once it is done a new call registers again.
    await device.register()
    expect(plugin.calls.filter(call => call === 'register')).toHaveLength(2)
  })

  it('lets a later call register after an earlier one timed out, and the late token does not break it', async () => {
    const plugin = fakePlugin({ permission: 'granted', token: null })
    const { device, requests } = setup(plugin, { tokenTimeoutMs: 100 })
    await expect(device.register()).rejects.toThrow(/did not hand out/)
    // The next call has its own waiter and gets the token the OS hands out now.
    const next = device.register()
    await vi.waitFor(() => expect(plugin.calls.filter(call => call === 'register')).toHaveLength(2), { interval: 1 })
    plugin.listeners.registration!({ value: 'late-token' })
    expect(await next).toBe(true)
    expect(requests.at(-1)!.body).toMatchObject({ token: 'late-token' })
  })

  it('opens a tapped notification\'s url only when it is a path inside the app', async () => {
    const plugin = fakePlugin({ permission: 'granted' })
    const { device, navigated } = setup(plugin)
    await device.register()
    const tap = (url: unknown) => plugin.listeners.pushNotificationActionPerformed!({ notification: { data: { url } } })
    tap('/shifts/42')
    tap('https://evil.example/phish')
    tap('//evil.example')
    tap(42)
    expect(navigated).toEqual(['/shifts/42'])
  })

  it('unregisters by token, also after a restart, and forgets it', async () => {
    const plugin = fakePlugin({ permission: 'granted' })
    const { device, requests, stored, deviceState } = setup(plugin)
    await device.register()
    expect(await device.unregister()).toBe(true)
    expect(requests.at(-1)).toEqual({ path: '/api/push/me/devices/unregister', body: { token: 'token-1' } })
    expect(plugin.calls).toContain('unregister')
    expect(stored.token).toBeNull()
    expect(deviceState.registered.value).toBe(false)

    // A new launch only knows the stored token.
    const restarted = setup(fakePlugin(), { storage: { get: () => 'stored-token', set: () => {} } })
    expect(await restarted.device.unregister()).toBe(true)
    expect(restarted.requests).toEqual([{ path: '/api/push/me/devices/unregister', body: { token: 'stored-token' } }])
  })

  it('does not throw when the server refuses the unregister (signed out already)', async () => {
    const warn = vi.fn()
    const { device, deviceState } = setup(fakePlugin(), {
      storage: { get: () => 'stored-token', set: () => {} },
      request: async () => {
        throw new Error('401')
      },
      log: { warn },
    })
    expect(await device.unregister()).toBe(false)
    expect(warn).toHaveBeenCalled()
    expect(deviceState.token.value).toBeNull()
  })
})

describe('native helpers', () => {
  it('hides `then` of a plugin proxy so a promise can resolve with it', async () => {
    const notImplemented = () => {
      throw new Error('not implemented')
    }
    const proxy = new Proxy({ register: () => 1 }, { get: (target, key) => key === 'then' ? notImplemented : Reflect.get(target, key) })
    const wrapped = withoutThen(proxy)
    expect((wrapped as { then?: unknown }).then).toBeUndefined()
    expect(await Promise.resolve(wrapped)).toBe(wrapped)
  })

  it('only treats a path of the app as in-app', () => {
    expect(['/a', '/a/b?x=1'].map(isInAppPath)).toEqual([true, true])
    expect(['', 'a', '//a', 'https://a', '/\\a', undefined, 3].map(isInAppPath)).toEqual([false, false, false, false, false, false, false])
  })

  it('generates a loader only for an installed plugin', () => {
    const helper = '/x/native'
    expect(nativeLoaderTemplate(null, helper)).toContain('export const loadPushNotifications = null')
    const capacitor = nativeLoaderTemplate('capacitor', helper)
    expect(capacitor).toContain('import("@capacitor/push-notifications")')
    expect(capacitor).toContain('withoutThen(push.PushNotifications)')
    expect(capacitor).toContain('provider: capacitorPushProvider(')
    expect(capacitor).not.toContain('@capacitor-firebase/messaging')
    const firebase = nativeLoaderTemplate('firebase', helper)
    expect(firebase).toContain('import("@capacitor-firebase/messaging")')
    expect(firebase).toContain('fromFirebaseMessaging(messaging.FirebaseMessaging)')
    expect(firebase).toContain('provider: "fcm"')
    expect(firebase).not.toContain('@capacitor/push-notifications')
  })

  it('picks Firebase Messaging over the Capacitor plugin, and nothing without @capacitor/core', () => {
    const only = (...packages: string[]) => (pkg: string) => packages.includes(pkg)
    expect(detectNativePushPlugin(only('@capacitor/core', '@capacitor-firebase/messaging', '@capacitor/push-notifications'))).toBe('firebase')
    expect(detectNativePushPlugin(only('@capacitor/core', '@capacitor-firebase/messaging'))).toBe('firebase')
    expect(detectNativePushPlugin(only('@capacitor/core', '@capacitor/push-notifications'))).toBe('capacitor')
    expect(detectNativePushPlugin(only('@capacitor/core'))).toBeNull()
    expect(detectNativePushPlugin(only('@capacitor-firebase/messaging'))).toBeNull()
  })

  it('says which provider issued a @capacitor/push-notifications token', () => {
    expect(capacitorPushProvider('ios')).toBe('apns')
    expect(capacitorPushProvider('android')).toBe('fcm')
  })
})

type FirebaseListeners = { tokenReceived?: (event: { token: string }) => void, notificationActionPerformed?: (event: { notification: { data?: unknown } }) => void }

function fakeFirebase(options: { permission?: PermissionState, token?: string, fail?: boolean } = {}) {
  const listeners: FirebaseListeners = {}
  const calls: string[] = []
  let permission = options.permission ?? 'prompt'
  let token = options.token ?? 'fcm-token-1'
  const plugin = {
    checkPermissions: async () => ({ receive: permission }),
    requestPermissions: async () => {
      calls.push('requestPermissions')
      permission = 'granted'
      return { receive: permission }
    },
    getToken: async () => {
      calls.push('getToken')
      if (options.fail) throw new Error('no APNs token')
      return { token }
    },
    deleteToken: async () => {
      calls.push('deleteToken')
    },
    addListener: async (event: keyof FirebaseListeners, listener: never) => {
      calls.push(`listen:${event}`)
      listeners[event] = listener
      return { remove: async () => {} }
    },
  } as unknown as FirebaseMessagingPluginLike
  return { plugin, listeners, calls, rotate: (next: string) => {
    token = next
    listeners.tokenReceived?.({ token: next })
  } }
}

describe('Firebase Messaging (the FCM token on iOS)', () => {
  function setupFirebase(firebase: ReturnType<typeof fakeFirebase>, platform = 'ios') {
    const requests: Array<{ path: string, body: unknown }> = []
    const navigated: string[] = []
    const deviceState = state()
    const device = createPushDevice({
      load: async () => ({ plugin: fromFirebaseMessaging(firebase.plugin), platform, provider: 'fcm' }),
      request: async (path, options) => {
        requests.push({ path, body: options.body })
      },
      state: deviceState,
      navigate: path => navigated.push(path),
      log: { warn: vi.fn() },
    })
    return { device, requests, navigated, deviceState }
  }

  it('registers an iOS device with its FCM token and says so', async () => {
    const firebase = fakeFirebase()
    const { device, requests, deviceState } = setupFirebase(firebase)
    expect(await device.register()).toBe(true)
    expect(firebase.calls).toEqual(['requestPermissions', 'listen:notificationActionPerformed', 'listen:tokenReceived', 'getToken'])
    expect(requests).toEqual([{ path: '/api/push/me/devices', body: { platform: 'ios', provider: 'fcm', token: 'fcm-token-1' } }])
    expect(deviceState.token.value).toBe('fcm-token-1')
  })

  it('registers again on every call, like the Capacitor plugin, and subscribes to rotations once', async () => {
    const firebase = fakeFirebase({ permission: 'granted' })
    const { device, requests } = setupFirebase(firebase)
    await device.register()
    await device.register()
    expect(requests).toHaveLength(2)
    expect(firebase.calls.filter(call => call === 'listen:tokenReceived')).toHaveLength(1)
    // The loader runs on every call: it must hand back the adapter the flow subscribed to.
    expect(fromFirebaseMessaging(firebase.plugin)).toBe(fromFirebaseMessaging(firebase.plugin))
  })

  it('sends a rotated token to the server, and ignores the token it already has', async () => {
    const firebase = fakeFirebase({ permission: 'granted' })
    const { device, requests } = setupFirebase(firebase)
    await device.register()
    firebase.listeners.tokenReceived!({ token: 'fcm-token-1' })
    firebase.rotate('fcm-token-2')
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]!.body).toEqual({ platform: 'ios', provider: 'fcm', token: 'fcm-token-2' })
  })

  it('rejects when Firebase hands out no token', async () => {
    const { device, requests } = setupFirebase(fakeFirebase({ permission: 'granted', fail: true }))
    await expect(device.register()).rejects.toThrow('no APNs token')
    expect(requests).toEqual([])
  })

  it('opens a tapped notification\'s in-app url', async () => {
    const firebase = fakeFirebase({ permission: 'granted' })
    const { device, navigated } = setupFirebase(firebase)
    await device.register()
    firebase.listeners.notificationActionPerformed!({ notification: { data: { url: '/shifts/42' } } })
    firebase.listeners.notificationActionPerformed!({ notification: { data: 'not an object' } })
    firebase.listeners.notificationActionPerformed!({ notification: { data: { url: 'https://evil.example' } } })
    expect(navigated).toEqual(['/shifts/42'])
  })

  it('deletes the token on unregister', async () => {
    const firebase = fakeFirebase({ permission: 'granted' })
    const { device, requests } = setupFirebase(firebase)
    await device.register()
    expect(await device.unregister()).toBe(true)
    expect(requests.at(-1)).toEqual({ path: '/api/push/me/devices/unregister', body: { token: 'fcm-token-1' } })
    expect(firebase.calls).toContain('deleteToken')
  })

  it('registers an Android device with its FCM token the same way', async () => {
    const { device, requests } = setupFirebase(fakeFirebase({ permission: 'granted' }), 'android')
    await device.register()
    expect(requests[0]!.body).toEqual({ platform: 'android', provider: 'fcm', token: 'fcm-token-1' })
  })
})
