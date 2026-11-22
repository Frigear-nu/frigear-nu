import type { Ref } from 'vue'
import { pushApi } from '../../utils/api'
import { isInAppPath } from './native'
import type { NativePush, NativePushLoader } from './native'

/**
 * `unknown`: not asked yet. `unsupported`: not a native app, or no push plugin is installed.
 * The others follow the operating system.
 */
export type PushPermission = 'unknown' | 'unsupported' | 'prompt' | 'granted' | 'denied'

export type PushDeviceState = {
  permission: Ref<PushPermission>
  /** The token of this installation, once the OS handed it out. */
  token: Ref<string | null>
  /** Whether the token is known to the server. */
  registered: Ref<boolean>
}

export type PushDeviceDeps = {
  load: NativePushLoader
  /** `$api` (bearer, client mode) or `$fetch` (cookie session). */
  request: (path: string, options: { method: 'POST', body: Record<string, unknown> }) => Promise<unknown>
  state: PushDeviceState
  appId?: string
  locale?: () => string | undefined
  /**
   * Remembers the token last registered with the server between launches, so `unregister()` works after a restart and
   * a new token replaces the old one.
   */
  storage?: { get: () => string | null, set: (token: string | null) => void }
  /**
   * The installation secret: generated once per installation and kept (`usePushDevice` keeps it in local storage). It
   * is sent with every registration and unregistration; the server stores its hash and moves a token to another user
   * only with it. Defaults to one secret per flow (this launch), from {@link newPushInstallationSecret}.
   */
  secret?: () => string
  /** Called with the in-app path of a tapped notification. */
  navigate?: (path: string) => void
  log?: Pick<Console, 'warn'>
  /** How long to wait for the OS to hand out the token. Defaults to 15 seconds. */
  tokenTimeoutMs?: number
}

export type PushDeviceActions = {
  register: () => Promise<boolean>
  unregister: () => Promise<boolean>
}

/**
 * A new installation secret: 32 random bytes, base64url. Generate it once per installation and keep it: it proves to
 * the server that a later registration comes from the same installation.
 */
export function newPushInstallationSecret(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * The device side of push, without Nuxt: asks for permission, registers through the push plugin and tells the server
 * the token and who issued it. `usePushDevice()` and the sign-in plugin are thin wrappers over it.
 */
export function createPushDevice(deps: PushDeviceDeps): PushDeviceActions {
  const { state } = deps
  const log = deps.log ?? console
  let launchSecret: string | undefined
  const secret = () => deps.secret?.() ?? (launchSecret ??= newPushInstallationSecret())
  let listening = false
  let waiting: { resolve: (token: string) => void, reject: (error: Error) => void } | undefined

  async function native(): Promise<NativePush | null> {
    if (!deps.load) return null
    const loaded = await deps.load()
    return loaded.platform === 'ios' || loaded.platform === 'android' ? loaded : null
  }

  async function post({ platform, provider }: NativePush, token: string) {
    // The token this installation registered last. When it differs (an iOS app that moved from its APNs token to its
    // FCM token, or a rotated token) the server removes that device, so this installation is not notified twice.
    const previous = deps.storage?.get() ?? null
    const replaces = previous && previous !== token ? previous : undefined
    await deps.request(pushApi.me.devices, {
      method: 'POST',
      body: { platform, provider, token, secret: secret(), ...(replaces ? { replaces } : {}), ...(deps.appId ? { appId: deps.appId } : {}), ...(deps.locale?.() ? { locale: deps.locale() } : {}) },
    })
    deps.storage?.set(token)
    state.registered.value = true
  }

  async function listen(loaded: NativePush) {
    const { plugin } = loaded
    if (listening) return
    listening = true
    await plugin.addListener('registration', ({ value }) => {
      state.token.value = value
      if (waiting) {
        waiting.resolve(value)
        waiting = undefined
      }
      // A later token (the OS rotated it): keep the server current while this installation is registered.
      else if (state.registered.value) post(loaded, value).catch(error => log.warn('[@frigear-nu/push] Updating the device token failed:', error))
    })
    await plugin.addListener('registrationError', ({ error }) => {
      log.warn('[@frigear-nu/push] The OS could not register for push notifications:', error)
      waiting?.reject(new Error(error))
      waiting = undefined
    })
    await plugin.addListener('pushNotificationActionPerformed', ({ notification }) => {
      const url = notification.data?.url
      if (isInAppPath(url)) deps.navigate?.(url)
    })
  }

  async function doRegister(): Promise<boolean> {
    const loaded = await native()
    if (!loaded) {
      state.permission.value = 'unsupported'
      return false
    }
    const { plugin } = loaded

    let { receive } = await plugin.checkPermissions()
    if (receive === 'prompt' || receive === 'prompt-with-rationale') receive = (await plugin.requestPermissions()).receive
    state.permission.value = receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt'
    if (receive !== 'granted') return false

    await listen(loaded)
    const timeoutMs = deps.tokenTimeoutMs ?? 15_000
    const token = await new Promise<string>((resolve, reject) => {
      // This call's own waiter: a timeout or an error only ever clears it, never one put in its place later.
      const mine: NonNullable<typeof waiting> = {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      }
      const timer = setTimeout(() => {
        if (waiting === mine) waiting = undefined
        reject(new Error('The OS did not hand out a push token in time.'))
      }, timeoutMs)
      waiting = mine
      plugin.register().catch((error: unknown) => {
        clearTimeout(timer)
        if (waiting === mine) waiting = undefined
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
    await post(loaded, token)
    return true
  }

  // One registration at a time: overlapping calls (the sign-in plugin and the app) share it instead of racing for the token.
  let inflight: Promise<boolean> | undefined
  function register(): Promise<boolean> {
    inflight ??= doRegister().finally(() => {
      inflight = undefined
    })
    return inflight
  }

  async function unregister(): Promise<boolean> {
    const token = state.token.value ?? deps.storage?.get() ?? null
    let removed = false
    if (token) {
      try {
        await deps.request(pushApi.me.unregister, { method: 'POST', body: { token, secret: secret() } })
        removed = true
      }
      catch (error) {
        log.warn('[@frigear-nu/push] Unregistering the device failed (call unregister() before signing out):', error)
      }
    }
    state.token.value = null
    state.registered.value = false
    deps.storage?.set(null)
    // Best effort: also tell the OS to forget the registration.
    const loaded = await native().catch(() => null)
    await loaded?.plugin.unregister().catch(() => undefined)
    return removed
  }

  return { register, unregister }
}
