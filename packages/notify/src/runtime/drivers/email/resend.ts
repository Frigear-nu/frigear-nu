import type { EmailDriver } from '../../../types'
import { assertOk, requireConfig, resolveFrom, toArray, type EmailConfig } from './shared'

export interface ResendConfig extends EmailConfig {
  apiToken?: string
}

export const createResendDriver = (config: ResendConfig): EmailDriver => async (n) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${requireConfig(config.apiToken, 'NUXT_NOTIFY_EMAIL_RESEND_API_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resolveFrom(config),
      to: toArray(n.to),
      subject: n.subject,
      html: n.body,
      text: n.text,
      reply_to: n.replyTo,
    }),
  })
  await assertOk('Resend', response)
}
