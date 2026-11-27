// A small RFC 5322 / MIME message builder for drivers that send a raw message (the Workers `send_email` binding), and
// RFC 2047 encoding of header words for drivers that take a header value as it is (SES). Workers safe: no Node APIs.

const encoder = new TextEncoder()

/** Bytes as base64 (`btoa` over chunks, so a long body never overflows the call stack). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  return btoa(binary)
}

/** A header value on one line: line breaks and other control characters become a space (no header injection). */
export function headerSafe(value: string): string {
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  return value.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim()
}

const PRINTABLE_ASCII = /^[\u0020-\u007E]*$/

/**
 * A header text as RFC 2047 encoded words when it has anything but printable ASCII (`=?UTF-8?B?...?=`, split so no
 * word is longer than 75 characters and no character is cut in half); plain ASCII is returned as it is.
 */
export function encodeHeaderWords(value: string): string {
  const text = headerSafe(value)
  if (PRINTABLE_ASCII.test(text)) return text
  const words: string[] = []
  let chunk = ''
  for (const char of text) {
    // 45 bytes of UTF-8 are 60 base64 characters: 72 with the `=?UTF-8?B?` and `?=` around them.
    if (encoder.encode(chunk + char).length > 45) {
      words.push(chunk)
      chunk = ''
    }
    chunk += char
  }
  if (chunk) words.push(chunk)
  return words.map(word => `=?UTF-8?B?${bytesToBase64(encoder.encode(word))}?=`).join(' ')
}

/** `"Name" <a@x.test>`, `Name <a@x.test>` or `a@x.test` split up. */
export function splitAddress(value: string): { address: string, name?: string } {
  const match = /^([^<>]*)<([^<>\s]+)>\s*$/.exec(value.trim())
  if (!match) return { address: value.trim() }
  const name = match[1]!.trim().replace(/^"|"$/g, '').trim()
  return name ? { address: match[2]!, name } : { address: match[2]! }
}

/**
 * An address for a header: `"Name" <a@x.test>` with the name quoted when it is ASCII, or RFC 2047 encoded
 * when it is not (`=?UTF-8?B?w6bDuMOl?= <a@x.test>`), or the bare address.
 */
export function formatAddressHeader(value: string): string {
  const { address, name } = splitAddress(value)
  const safeAddress = headerSafe(address)
  if (!name) return safeAddress
  const safeName = headerSafe(name).replace(/["\\]/g, '')
  if (!safeName) return safeAddress
  return PRINTABLE_ASCII.test(safeName) ? `"${safeName}" <${safeAddress}>` : `${encodeHeaderWords(safeName)} <${safeAddress}>`
}

/** The domain of an address (`''` without one). */
function domainOf(address: string): string {
  const at = address.lastIndexOf('@')
  return at < 0 ? '' : address.slice(at + 1).trim().toLowerCase()
}

/** A new globally unique Message-ID on the sender's domain, without angle brackets (`<hex>@<domain>` in the header). */
export function generateMessageId(from: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const id = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${id}@${domainOf(splitAddress(from).address) || 'localhost'}`
}

/** Headers the builder writes itself: a value for one of these in `headers` is ignored. */
const RESERVED_HEADERS = new Set(['from', 'to', 'cc', 'bcc', 'subject', 'reply-to', 'message-id', 'date', 'mime-version', 'content-type', 'content-transfer-encoding'])

/** A header name as RFC 5322 allows it (printable ASCII but `:`). */
const HEADER_NAME = /^[\u0021-\u0039\u003B-\u007E]+$/

export type MimeMessageInput = {
  from: string
  to: string[]
  cc?: string[]
  replyTo?: string
  subject: string
  html?: string
  text?: string
  /** Extra headers (`In-Reply-To`, `References`, `List-Unsubscribe`); the ones the builder writes are ignored. */
  headers?: Record<string, string>
  /** Without angle brackets. */
  messageId: string
  date?: Date
}

/** Base64 of a UTF-8 text, in lines of 76 characters. */
function base64Body(text: string): string {
  return bytesToBase64(encoder.encode(text)).replace(/.{1,76}/g, line => `${line}\r\n`)
}

function part(contentType: string, text: string): string {
  return `Content-Type: ${contentType}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64Body(text)}`
}

/**
 * A complete RFC 5322 message with CRLF line ends: the headers (non-ASCII names and subjects RFC 2047 encoded, every
 * value on one line), and a `text/plain`, `text/html` or `multipart/alternative` body in base64.
 */
export function buildMimeMessage(input: MimeMessageInput): string {
  const lines = [
    `From: ${formatAddressHeader(input.from)}`,
    `To: ${input.to.map(formatAddressHeader).join(', ')}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.map(formatAddressHeader).join(', ')}`] : []),
    ...(input.replyTo ? [`Reply-To: ${formatAddressHeader(input.replyTo)}`] : []),
    `Subject: ${encodeHeaderWords(input.subject)}`,
    `Message-ID: <${headerSafe(input.messageId).replace(/^<|>$/g, '')}>`,
    `Date: ${(input.date ?? new Date()).toUTCString().replace('GMT', '+0000')}`,
    'MIME-Version: 1.0',
  ]
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    if (!HEADER_NAME.test(name) || RESERVED_HEADERS.has(name.toLowerCase())) continue
    lines.push(`${name}: ${encodeHeaderWords(value)}`)
  }
  const text = input.text
  const html = input.html
  if (text !== undefined && html !== undefined) {
    const boundary = `=_${generateMessageId('x@b').split('@')[0]}`
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    return `${lines.join('\r\n')}\r\n\r\n--${boundary}\r\n${part('text/plain', text)}--${boundary}\r\n${part('text/html', html)}--${boundary}--\r\n`
  }
  const [type, body] = html !== undefined ? ['text/html', html] : ['text/plain', text ?? '']
  return `${lines.join('\r\n')}\r\n${part(type, body)}`
}
