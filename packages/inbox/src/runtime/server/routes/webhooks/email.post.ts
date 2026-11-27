import { apiError, notConfigured, validationError } from '@frigear-nu/module-kit/server'
import { inboxEmailPayload } from '../../../utils/payloads'
import { verifySha256Signature } from '../../../utils/signature'

// The `webhook` inbound email driver: an inbound email, posted by the host's email provider as provider-agnostic JSON
// and signed with `X-Inbox-Signature: sha256=<HMAC-SHA256 of the raw body with inbox.email.webhookSecret>`. The
// recipients pick the mailboxes (`inboxIngestEmail`): every `email` channel account whose address (or plus address) is
// in `To` or `Cc` gets the message, stored once per account (two connected mailboxes on one email are two threads).
// Answers 200 for a stored, duplicate or unroutable message so the provider stops retrying, 401 for a bad signature,
// 400 for a body that is not an email. The answer describes the first account's delivery; with more than one,
// `deliveries` lists each with its `mailboxId`.
export default defineEventHandler(async (event) => {
  const secret = inboxConfig(event).email.webhookSecret
  if (!secret) throw notConfigured('The email webhook has no secret (inbox.email.webhookSecret).')
  const raw = await inboxReadRawBody(event)
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
  return (await inboxIngestEmail(event, parsed.data)).response
})
