import type { EmailDriver } from '../../../types'
import { assertOk, requireConfig, resolveFrom, toArray, type EmailConfig } from './shared'
import { signRequest } from './sigv4'

export interface SesConfig extends EmailConfig {
  region?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
}

export const createSesDriver = (config: SesConfig): EmailDriver => async (n) => {
  const region = requireConfig(config.region, 'NUXT_NOTIFY_EMAIL_SES_REGION')
  const accessKeyId = requireConfig(config.accessKeyId, 'NUXT_NOTIFY_EMAIL_SES_ACCESS_KEY_ID')
  const secretAccessKey = requireConfig(config.secretAccessKey, 'NUXT_NOTIFY_EMAIL_SES_SECRET_ACCESS_KEY')

  const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`
  const body = JSON.stringify({
    FromEmailAddress: resolveFrom(config),
    Destination: { ToAddresses: toArray(n.to) },
    ReplyToAddresses: n.replyTo ? [n.replyTo] : undefined,
    Content: {
      Simple: {
        Subject: { Data: n.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: n.body, Charset: 'UTF-8' },
          ...(n.text ? { Text: { Data: n.text, Charset: 'UTF-8' } } : {}),
        },
      },
    },
  })

  const headers = await signRequest({
    method: 'POST',
    url,
    body,
    region,
    service: 'ses',
    accessKeyId,
    secretAccessKey,
    sessionToken: config.sessionToken || undefined,
  })
  await assertOk('SES', await fetch(url, { method: 'POST', headers, body }))
}
