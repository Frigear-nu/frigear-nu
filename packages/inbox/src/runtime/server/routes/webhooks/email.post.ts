import { apiError, notConfigured, validationError } from '@frigear-nu/module-kit/server'
import { emailRecipients, emailToInbound, inboxEmailPayload } from '../../../utils/payloads'
import { verifySha256Signature } from '../../../utils/signature'

// An inbound email, posted by the host's email provider as provider-agnostic JSON and signed with
// `X-Inbox-Signature: sha256=<HMAC-SHA256 of the raw body with inbox.email.webhookSecret>`. The recipient picks the
// mailbox (an `email` channel account with that address). Answers 200 for a stored, duplicate or unroutable message so
// the provider stops retrying, 401 for a bad signature, 400 for a body that is not an email.
export default defineEventHandler(async (event) => {
  const secret = inboxConfig(event).email.webhookSecret
  if (!secret) throw notConfigured('The email webhook has no secret (inbox.email.webhookSecret).')
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  if (!(await verifySha256Signature(secret, raw, getRequestHeader(event, 'x-inbox-signature')))) {
    throw apiError(401, 'invalid_signature', 'The signature does not match.')
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  }
  catch {
    throw validationError([{ path: [], message: 'The body is not JSON.' }], 'Invalid email')
  }
  const parsed = inboxEmailPayload.safeParse(json)
  if (!parsed.success) throw validationError(parsed.error.issues, 'Invalid email')

  for (const recipient of emailRecipients(parsed.data)) {
    const account = await inboxFindAccount('email', { address: recipient })
    if (!account) continue
    const result = await inboxReceive(event, 'email', emailToInbound(parsed.data, recipient), account)
    if (result.status === 'received') return { status: 'received', threadId: result.thread.id, messageId: result.message.id }
    if (result.status === 'duplicate') return { status: 'duplicate', messageId: result.messageId }
    return { status: 'ignored', reason: result.reason }
  }
  return { status: 'ignored', reason: 'no_account' }
})
