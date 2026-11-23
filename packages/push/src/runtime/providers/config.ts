import type { PushProvider, PushRuntimeConfig } from '../../types'
import { createApnsSender } from './apns'
import type { ApnsConfig } from './apns'
import { createFcmSender, parseFcmServiceAccount } from './fcm'
import { DEFAULT_TIMEOUT_MS } from './types'
import type { DeviceSender, ProviderEnvironment } from './types'

const isSet = (value: unknown) => typeof value === 'string' && value.trim() !== ''

/** Whether the Firebase service account is configured. */
export const hasFcmCredentials = (config: PushRuntimeConfig) => isSet(config.fcm?.serviceAccount)

/** Whether the APNs key, key id, team id and topic are all configured. */
export const hasApnsCredentials = (config: PushRuntimeConfig) =>
  isSet(config.apns?.keyId) && isSet(config.apns?.teamId) && isSet(config.apns?.topic) && isSet(config.apns?.privateKey)

/**
 * `log` or `providers`: the configured delivery, or when unset `providers` once any credentials are configured and `log`
 * otherwise (development without setup only logs).
 */
export function resolvePushDelivery(config: PushRuntimeConfig): 'log' | 'providers' {
  if (config.delivery === 'log' || config.delivery === 'providers') return config.delivery
  if (isSet(config.delivery)) throw new Error(`[@frigear-nu/push] push.delivery must be "log" or "providers", got "${config.delivery}".`)
  return hasFcmCredentials(config) || hasApnsCredentials(config) ? 'providers' : 'log'
}

/** `push.timeoutMs` (a number, or the string an env var gives), or the 10 second default. */
export function requestTimeoutMs(config: Pick<PushRuntimeConfig, 'timeoutMs'>): number {
  const value = Number(config.timeoutMs)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS
}

/** The `sandbox` setting: an env var arrives as the string `"true"`. */
export const isApnsSandbox = (value: boolean | string | undefined) => value === true || (typeof value === 'string' && ['true', '1', 'yes'].includes(value.trim().toLowerCase()))

export function apnsConfigOf(config: PushRuntimeConfig): ApnsConfig {
  return {
    keyId: config.apns.keyId.trim(),
    teamId: config.apns.teamId.trim(),
    topic: config.apns.topic.trim(),
    privateKey: config.apns.privateKey,
    sandbox: isApnsSandbox(config.apns.sandbox),
  }
}

/** Whether `value` names a provider. */
export const isPushProvider = (value: unknown): value is PushProvider => value === 'fcm' || value === 'apns'

/**
 * `push.ios`: the provider of an iOS token whose device did not say. `apns` (the default), because a client that does
 * not say is one built on `@capacitor/push-notifications`, which hands out the APNs token on iOS. Guessing `fcm` for it
 * would be worse than failing: FCM rejects an APNs token as invalid and the device would be revoked.
 */
export function resolveIosProvider(config: Pick<PushRuntimeConfig, 'ios'>): PushProvider {
  const value = typeof config.ios === 'string' ? config.ios.trim().toLowerCase() : ''
  if (!value) return 'apns'
  if (isPushProvider(value)) return value
  throw new Error(`[@frigear-nu/push] push.ios must be "fcm" or "apns", got "${config.ios}".`)
}

/**
 * Where a device's pushes go: the provider it registered with, else FCM for Android and `ios` for iOS. `undefined` for
 * a platform no provider serves (`web`).
 */
export function resolveDeviceProvider(device: { platform: string, provider?: string | null }, ios: PushProvider): PushProvider | undefined {
  if (isPushProvider(device.provider)) return device.provider
  if (device.platform === 'android') return 'fcm'
  if (device.platform === 'ios') return ios
  return undefined
}

export type ProviderSenders = { fcm?: DeviceSender, apns?: DeviceSender }

/** One sender per configured provider. Missing credentials leave the provider out. */
export function createProviderSenders(config: PushRuntimeConfig, env: ProviderEnvironment = {}): ProviderSenders {
  env = { timeoutMs: requestTimeoutMs(config), ...env }
  return {
    fcm: hasFcmCredentials(config) ? createFcmSender(parseFcmServiceAccount(config.fcm.serviceAccount), env) : undefined,
    apns: hasApnsCredentials(config) ? createApnsSender(apnsConfigOf(config), env) : undefined,
  }
}

/**
 * What is wrong with the push settings, one sentence per problem: an unknown `delivery` or `ios`, or a Firebase service
 * account that does not parse. Empty when they are usable. The module checks this once at startup and logs it.
 */
export function pushConfigProblems(config: PushRuntimeConfig): string[] {
  const problems: string[] = []
  const check = (run: () => unknown) => {
    try {
      run()
    }
    catch (error) {
      problems.push((error instanceof Error ? error.message : String(error)).replace(/^\[@frigear-nu\/push\] /, ''))
    }
  }
  check(() => resolvePushDelivery(config))
  check(() => resolveIosProvider(config))
  if (hasFcmCredentials(config)) check(() => parseFcmServiceAccount(config.fcm.serviceAccount))
  return problems
}
