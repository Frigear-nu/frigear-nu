import type { H3Event } from 'h3'
import type { InboxRuntimeConfig } from '../../../types'

/** The server-only inbox settings (`runtimeConfig.inbox`). */
export function inboxConfig(event?: H3Event): InboxRuntimeConfig {
  return (useRuntimeConfig(event) as unknown as { inbox: InboxRuntimeConfig }).inbox
}

/** Valid secret names: upper case letters, digits and `_`, so a ref can only name an inbox secret. */
export const INBOX_SECRET_REF = /^[A-Z][A-Z0-9_]{0,63}$/

/**
 * The value of a channel account's `secretRef`: `inbox.secrets[ref]` of the runtime config, else the environment
 * variable `NUXT_INBOX_SECRET_<REF>`. Secrets live only there, never in the database; a ref can name nothing else.
 */
export function inboxSecret(ref: string | null | undefined, event?: H3Event): string | undefined {
  if (!ref || !INBOX_SECRET_REF.test(ref)) return undefined
  const fromConfig = inboxConfig(event).secrets?.[ref]
  if (fromConfig) return fromConfig
  const fromEnv = typeof process !== 'undefined' ? process.env?.[`NUXT_INBOX_SECRET_${ref}`] : undefined
  return fromEnv || undefined
}
