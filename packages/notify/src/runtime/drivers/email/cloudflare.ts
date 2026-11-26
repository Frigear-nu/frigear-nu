import type { EmailDriver } from '../../../types'
import { assertOk, hasHeaders, requireConfig, resolveFrom, toArray, type EmailConfig } from './shared'

export interface CloudflareConfig extends EmailConfig {
  accountId?: string
  apiToken?: string
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
      from: resolveFrom(config),
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
