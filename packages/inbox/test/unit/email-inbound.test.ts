import { createHmac } from 'node:crypto'
import PostalMime from 'postal-mime'
import { describe, expect, it } from 'vitest'
import { authenticatedFromResults, parsedEmailToPayload, resendEmailToPayload, signSvix, verifySvixSignature } from '../../src/runtime/utils/email-inbound'
import { emailToInbound, inboxEmailPayload } from '../../src/runtime/utils/payloads'

// A reply as Cloudflare Email Routing hands it to the Worker: the receiving server's Authentication-Results on top, and
// a forged one further down that the sender wrote.
const RAW = [
  'Authentication-Results: mx.cloudflare.net; dkim=pass header.d=example.org header.s=mail; dmarc=pass (p=reject) header.from=example.org policy.dmarc=reject; spf=pass smtp.mailfrom=kari@example.org',
  'Received: from mail.example.org by mx.cloudflare.net',
  'Authentication-Results: forged.example; dmarc=pass header.from=example.org',
  'From: Kari Nordmann <kari@example.org>',
  'To: Support <support+ibt_abc12345@inbox.example.org>',
  'Cc: ola@example.org',
  'Subject: Re: Where is my ticket?',
  'Message-ID: <reply-1@mail.example.org>',
  'In-Reply-To: <first-1@mail.example.org>',
  'References: <first-1@mail.example.org>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Thanks, it arrived.',
  '--b1',
  'Content-Type: text/plain; name="ticket.txt"',
  'Content-Disposition: attachment; filename="ticket.txt"',
  '',
  'TICKET-123',
  '--b1--',
  '',
].join('\r\n')

describe('Authentication-Results', () => {
  const pass = (results: string[], from = 'kari@example.org') => authenticatedFromResults(results, from)

  it('passes DMARC, an aligned DKIM signature or an aligned SPF sender of the From domain', () => {
    expect(pass(['mx.example; dmarc=pass header.from=example.org'])).toBe(true)
    expect(pass(['mx.example; dkim=pass header.d=example.org'])).toBe(true)
    expect(pass(['mx.example; dkim=pass header.d=example.org'], 'kari@mail.example.org')).toBe(true)
    expect(pass(['mx.example; spf=pass smtp.mailfrom=bounce@example.org'])).toBe(true)
  })

  it('fails anything else', () => {
    expect(pass([])).toBe(false)
    expect(pass(['mx.example; dmarc=fail header.from=example.org; dkim=fail header.d=example.org'])).toBe(false)
    expect(pass(['mx.example; dkim=pass header.d=evil.example'])).toBe(false)
    expect(pass(['mx.example; spf=pass smtp.mailfrom=bounce@evil.example'])).toBe(false)
    expect(pass(['mx.example; dkim=pass header.d=org'])).toBe(false)
    expect(pass(['mx.example; dmarc=pass header.from=example.org'], 'not-an-address')).toBe(false)
  })

  it('reads only the topmost header, the receiving server\'s', () => {
    expect(pass(['mx.example; dmarc=fail header.from=example.org', 'forged.example; dmarc=pass header.from=example.org'])).toBe(false)
  })

  it('reads only a header of a trusted receiving server, when given', () => {
    expect(authenticatedFromResults(['forged.example; dmarc=pass header.from=example.org'], 'kari@example.org', ['mx.cloudflare.net'])).toBe(false)
    expect(authenticatedFromResults(['mx.cloudflare.net; dmarc=pass header.from=example.org'], 'kari@example.org', ['mx.cloudflare.net'])).toBe(true)
  })
})

describe('cloudflare: raw MIME to a payload', () => {
  it('maps the sender, recipients, threading headers, authentication and files', async () => {
    const { payload, attachments } = parsedEmailToPayload(await PostalMime.parse(RAW), { fallbackMessageId: '<fallback@x>' })
    expect(inboxEmailPayload.safeParse(payload).success).toBe(true)
    expect(payload).toMatchObject({
      messageId: '<reply-1@mail.example.org>',
      from: { email: 'kari@example.org', name: 'Kari Nordmann' },
      to: [{ email: 'support+ibt_abc12345@inbox.example.org', name: 'Support' }],
      cc: [{ email: 'ola@example.org', name: null }],
      subject: 'Re: Where is my ticket?',
      inReplyTo: '<first-1@mail.example.org>',
      references: '<first-1@mail.example.org>',
      authenticated: true,
      html: null,
    })
    expect(payload.text?.trim()).toBe('Thanks, it arrived.')
    expect(attachments).toHaveLength(1)
    expect(attachments[0]).toMatchObject({ filename: 'ticket.txt', contentType: 'text/plain' })
    expect(new TextDecoder().decode(attachments[0]!.content).trim()).toBe('TICKET-123')
    expect(emailToInbound(payload, 'support@inbox.example.org', 'ibt_abc12345')).toMatchObject({ threadHint: 'ibt_abc12345', references: ['first-1@mail.example.org'], authenticated: true })
  })

  it('is unauthenticated with only a forged result, and falls back to a hash for a missing Message-ID', async () => {
    const raw = RAW.split('\r\n').filter(line => !line.startsWith('Authentication-Results: mx.') && !line.startsWith('Message-ID')).join('\r\n')
    const { payload } = parsedEmailToPayload(await PostalMime.parse(raw), { fallbackMessageId: '<fallback@x>' })
    expect(payload.authenticated).toBe(false)
    expect(payload.messageId).toBe('<fallback@x>')
  })

  it('keeps the HTML as text when there is no text part', async () => {
    const raw = ['From: a@example.org', 'To: support@inbox.example.org', 'Subject: Hi', 'Content-Type: text/html', '', '<p>Hello <b>there</b></p>', ''].join('\r\n')
    const { payload } = parsedEmailToPayload(await PostalMime.parse(raw), { fallbackMessageId: '<f@x>' })
    expect(payload.text).toBe('Hello there')
    expect(payload.html).toBeNull()
  })
})

describe('resend', () => {
  it('maps a received email, authenticated by Resend\'s DMARC or DKIM verdict only', () => {
    const email = {
      id: 'em_1',
      from: 'Kari <kari@example.org>',
      to: ['support@inbox.example.org'],
      cc: [],
      subject: 'Re: Hi',
      text: 'Hello',
      html: '<p>Hello</p>',
      message_id: '<r1@mail.example.org>',
      headers: { 'in-reply-to': '<first@x>', 'references': '<first@x>' },
      authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
    }
    const payload = resendEmailToPayload(email)
    expect(inboxEmailPayload.safeParse(payload).success).toBe(true)
    expect(payload).toMatchObject({ messageId: '<r1@mail.example.org>', from: 'Kari <kari@example.org>', to: ['support@inbox.example.org'], cc: null, inReplyTo: '<first@x>', references: '<first@x>', authenticated: true })
    expect(resendEmailToPayload({ ...email, authentication: { spf: 'pass', dkim: 'gray', dmarc: 'gray' } }).authenticated).toBe(false)
    expect(resendEmailToPayload({ ...email, authentication: null }).authenticated).toBe(false)
    expect(resendEmailToPayload({ ...email, message_id: null }).messageId).toBe('resend:em_1')
  })

  describe('Svix signatures', () => {
    const secret = `whsec_${Buffer.from('a-test-signing-key-of-some-length').toString('base64')}`
    const body = JSON.stringify({ type: 'email.received', data: { email_id: 'em_1' } })
    const now = 1_760_000_000_000
    const timestamp = String(now / 1000)

    it('signs like Svix: base64 HMAC-SHA256 of id.timestamp.body with the decoded key', async () => {
      const expected = createHmac('sha256', Buffer.from('a-test-signing-key-of-some-length')).update(`msg_1.${timestamp}.${body}`).digest('base64')
      expect(await signSvix(secret, 'msg_1', timestamp, body)).toBe(`v1,${expected}`)
    })

    it('verifies one of several signatures, within five minutes', async () => {
      const signature = await signSvix(secret, 'msg_1', timestamp, body)
      expect(await verifySvixSignature(secret, { id: 'msg_1', timestamp, signature: `v1,AAAA ${signature}` }, body, now)).toBe(true)
      expect(await verifySvixSignature(secret, { id: 'msg_1', timestamp, signature }, body, now + 299_000)).toBe(true)
    })

    it('refuses a changed body, id or key, an old timestamp, and anything missing', async () => {
      const signature = await signSvix(secret, 'msg_1', timestamp, body)
      expect(await verifySvixSignature(secret, { id: 'msg_1', timestamp, signature }, `${body} `, now)).toBe(false)
      expect(await verifySvixSignature(secret, { id: 'msg_2', timestamp, signature }, body, now)).toBe(false)
      expect(await verifySvixSignature(`whsec_${Buffer.from('another-key').toString('base64')}`, { id: 'msg_1', timestamp, signature }, body, now)).toBe(false)
      expect(await verifySvixSignature(secret, { id: 'msg_1', timestamp, signature }, body, now + 301_000)).toBe(false)
      expect(await verifySvixSignature(secret, { id: 'msg_1', timestamp, signature: signature.replace('v1,', 'v2,') }, body, now)).toBe(false)
      expect(await verifySvixSignature('', { id: 'msg_1', timestamp, signature }, body, now)).toBe(false)
      expect(await verifySvixSignature(secret, { id: null, timestamp, signature }, body, now)).toBe(false)
    })
  })
})
