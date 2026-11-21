import { apiError, notConfigured } from '@frigear-nu/module-kit/server'
import { parseMetaWebhook } from '../../../utils/payloads'
import { verifySha256Signature } from '../../../utils/signature'

// Messages from WhatsApp, Messenger and Instagram, signed by Meta with `X-Hub-Signature-256` (HMAC-SHA256 of the raw
// body with the app secret). Each message goes to the account at the phone number id, page id or Instagram id it was
// sent to. Always 200 once the signature holds, with counts, so Meta does not retry and back off: duplicates (retries)
// are stored once, messages for unknown accounts are dropped.
export default defineEventHandler(async (event) => {
  const appSecret = inboxConfig(event).meta.appSecret
  if (!appSecret) throw notConfigured('The Meta webhook has no app secret (inbox.meta.appSecret).')
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  if (!(await verifySha256Signature(appSecret, raw, getRequestHeader(event, 'x-hub-signature-256')))) {
    throw apiError(401, 'invalid_signature', 'The signature does not match.')
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  }
  catch {
    throw apiError(400, 'invalid_body', 'The body is not JSON.')
  }
  const counts = { received: 0, duplicates: 0, ignored: 0, failed: 0 }
  const messages = parseMetaWebhook(json)
  for (const channel of ['whatsapp', 'messenger', 'instagram'] as const) {
    const batch = messages.filter(message => message.channel === channel).map(({ channel: _channel, ...message }) => message)
    if (!batch.length) continue
    const result = await inboxReceiveAll(event, channel, batch)
    counts.received += result.received
    counts.duplicates += result.duplicates
    counts.ignored += result.ignored
    counts.failed += result.failed
  }
  return counts
})
