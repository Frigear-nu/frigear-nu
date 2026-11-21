import type { PushRuntimeConfig } from '../../types'
import { createApnsSender } from './apns'
import type { ApnsConfig } from './apns'
import { createFcmSender, parseFcmServiceAccount } from './fcm'
import type { DeviceSender, ProviderEnvironment } from './types'

const isSet = (value: unknown) => typeof value === 'string' && value.trim() !== ''

/** Whether the Firebase service account is configured. */
export const hasFcmCredentials = (config: PushRuntimeConfig) => isSet(config.fcm?.serviceAccount)

/** Whether the APNs key, key id, team id and topic are all configured. */
export const hasApnsCredentials = (config: PushRuntimeConfig) =>
  isSet(config.apns?.keyId) && isSet(config.apns?.teamId) && isSet(config.apns?.topic) && isSet(config.apns?.privateKey)

/**
 * `log` or `providers`: the configured driver, or when unset `providers` once any credentials are configured and `log`
 * otherwise (development without setup only logs).
 */
export function resolvePushDriver(config: PushRuntimeConfig): 'log' | 'providers' {
  if (config.driver === 'log' || config.driver === 'providers') return config.driver
  if (isSet(config.driver)) throw new Error(`[@frigear-nu/push] push.driver must be "log" or "providers", got "${config.driver}".`)
  return hasFcmCredentials(config) || hasApnsCredentials(config) ? 'providers' : 'log'
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

export type PlatformSenders = { android?: DeviceSender, ios?: DeviceSender }

/** One sender per configured provider (`android` is FCM, `ios` is APNs). Missing credentials leave the platform out. */
export function createPlatformSenders(config: PushRuntimeConfig, env: ProviderEnvironment = {}): PlatformSenders {
  return {
    android: hasFcmCredentials(config) ? createFcmSender(parseFcmServiceAccount(config.fcm.serviceAccount), env) : undefined,
    ios: hasApnsCredentials(config) ? createApnsSender(apnsConfigOf(config), env) : undefined,
  }
}
