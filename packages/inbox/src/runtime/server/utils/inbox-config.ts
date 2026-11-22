import type { H3Event } from 'h3'
import type { InboxRuntimeConfig } from '../../../types'

/** The server-only inbox settings (`runtimeConfig.inbox`). */
export function inboxConfig(event?: H3Event): InboxRuntimeConfig {
  return (useRuntimeConfig(event) as unknown as { inbox: InboxRuntimeConfig }).inbox
}

/** Valid secret names: upper case letters, digits and `_`, so a ref can only name an inbox secret. */
export const INBOX_SECRET_REF = /^[A-Z][A-Z0-9_]{0,63}$/

/**
 * The value of a channel account's `secretRef`: `inbox.secrets[ref]` of the runtime config, read per request so the
 * `NUXT_INBOX_SECRETS_<REF>` (or JSON `NUXT_INBOX_SECRETS`) environment override applies, on Cloudflare Workers too.
 * Never read from `process.env` directly; secrets never go into the database, and a ref can name nothing else.
 */
export function inboxSecret(ref: string | null | undefined, event?: H3Event): string | undefined {
  if (!ref || !INBOX_SECRET_REF.test(ref)) return undefined
  return inboxConfig(event).secrets?.[ref] || undefined
}
