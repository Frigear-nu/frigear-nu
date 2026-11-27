import type { EmailDriver } from '../../../types'
import { assertOk, hasHeaders, parseFromAddress, requireConfig, resolveFrom, toArray, type EmailConfig } from './shared'

export interface CloudflareConfig extends EmailConfig {
  accountId?: string
  apiToken?: string
}

/** A sender as Cloudflare's REST API takes it: the bare address, or `{ address, name }` with a display name. */
export function cloudflareFrom(from: string): string | { address: string, name: string } {
  const parsed = parseFromAddress(from)
  return parsed.name ? { address: parsed.address, name: parsed.name } : parsed.address
}

export const createCloudflareDriver = (config: CloudflareConfig): EmailDriver => async (n) => {
  const accountId = requireConfig(config.accountId, 'NUXT_NOTIFY_EMAIL_CLOUDFLARE_ACCOUNT_ID')
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${requireConfig(config.apiToken, 'NUXT_NOTIFY_EMAIL_CLOUDFLARE_API_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // The REST API documents a bare address or `{ address, name }`, not the `"Name" <address>` form.
      from: cloudflareFrom(resolveFrom(config, n)),
      to: toArray(n.to),
      cc: n.cc ? toArray(n.cc) : undefined,
      subject: n.subject,
      html: n.body,
      text: n.text,
      reply_to: n.replyTo,
      headers: hasHeaders(n.headers) ? n.headers : undefined,
    }),
  })
  await assertOk('Cloudflare', response)
}
