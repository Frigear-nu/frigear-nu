import type { H3Event } from 'h3'
import { apiError } from '@frigear-nu/module-kit/server'

/** The largest webhook body read: an inbound email or a Meta batch is far smaller. */
export const INBOX_MAX_WEBHOOK_BYTES = 1024 * 1024

/**
 * The raw body of a webhook (signatures are over the exact bytes), at most `INBOX_MAX_WEBHOOK_BYTES`: a larger
 * `content-length` is refused before reading, a larger body after. Both answer 413 `payload_too_large`.
 */
export async function inboxReadRawBody(event: H3Event): Promise<string> {
  const tooLarge = () => apiError(413, 'payload_too_large', `The body is larger than ${INBOX_MAX_WEBHOOK_BYTES} bytes.`)
  const declared = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (declared > INBOX_MAX_WEBHOOK_BYTES) throw tooLarge()
  const raw = (await readRawBody(event, false)) ?? new Uint8Array()
  if (raw.byteLength > INBOX_MAX_WEBHOOK_BYTES) throw tooLarge()
  return new TextDecoder().decode(raw)
}
