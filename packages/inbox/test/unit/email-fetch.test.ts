import PostalMime from 'postal-mime'
import { describe, expect, it } from 'vitest'
import { GMAIL_AUTHSERV_IDS, mailboxRecipients, parseAuthservIds, parsedEmailToPayload } from '../../src/runtime/utils/email-inbound'
import { outboundEmailExternalId, referenceExternalIds, replyMessageIds } from '../../src/runtime/utils/email-routing'

// The pure parts of the drivers that fetch mail themselves (Gmail, IMAP) and of threading by our own Message-IDs.

describe('parseAuthservIds', () => {
  it('reads a comma separated list or an array, lower case, once each', () => {
    expect(parseAuthservIds('mx.cloudflare.net, MX.Example.org,mx.cloudflare.net')).toEqual(['mx.cloudflare.net', 'mx.example.org'])
    expect(parseAuthservIds(['mx.google.com', '', 'bad id'])).toEqual(['mx.google.com'])
    expect(parseAuthservIds(undefined)).toEqual([])
  })
})

describe('mailboxRecipients', () => {
  const payload = { messageId: 'x', from: 'kari@example.com', to: ['support+ibt_abc12345@example.org', 'other@example.org'], cc: ['Support@Example.org'], text: 'hi' }
  it('keeps the account address and its plus addresses, and always names the account', () => {
    expect(mailboxRecipients(payload, 'support@example.org')).toEqual(['support+ibt_abc12345@example.org', 'support@example.org'])
    // A Bcc or a group: the mailbox's own address only.
    expect(mailboxRecipients({ ...payload, to: ['team@example.org'], cc: null }, 'support@example.org')).toEqual(['support@example.org'])
  })
})

describe('a message fetched from Gmail', () => {
  it('is authenticated by mx.google.com and not by an Authentication-Results the sender wrote', async () => {
    const raw = [
      'Authentication-Results: mx.google.com; dkim=pass header.i=@example.com header.s=s1; spf=pass smtp.mailfrom=kari@example.com; dmarc=pass (p=NONE) header.from=example.com',
      'Authentication-Results: mx.cloudflare.net; dmarc=pass header.from=example.com',
      'From: Kari <kari@example.com>',
      'To: support@example.org',
      'Message-ID: <g1@example.com>',
      'Subject: Hi',
      '',
      'Hello',
    ].join('\r\n')
    const parsed = await PostalMime.parse(raw)
    expect(parsedEmailToPayload(parsed, { fallbackMessageId: 'f', authservIds: GMAIL_AUTHSERV_IDS }).payload.authenticated).toBe(true)
    // Defaults to Cloudflare's authserv-id: Google's header on top is not trusted then.
    expect(parsedEmailToPayload(parsed, { fallbackMessageId: 'f' }).payload.authenticated).toBe(false)
    // No authserv-id to trust (an IMAP account without `authservIds`): never authenticated.
    expect(parsedEmailToPayload(parsed, { fallbackMessageId: 'f', authservIds: [] }).payload.authenticated).toBe(false)
  })
})

describe('threading by our own Message-IDs', () => {
  it('looks a referenced Message-ID up as an inbound message and as one of our replies', () => {
    expect(outboundEmailExternalId('abc@inbox.example.org')).toBe('email:out:abc@inbox.example.org')
    expect(referenceExternalIds('email', 'abc@inbox.example.org')).toEqual(['email:<abc@inbox.example.org>', 'email:abc@inbox.example.org', 'email:out:abc@inbox.example.org'])
    // Other channels have no Message-IDs of ours.
    expect(referenceExternalIds('whatsapp', 'wamid.1')).toEqual(['whatsapp:<wamid.1>', 'whatsapp:wamid.1'])
  })
  it('names our reply first when the answer is to it', () => {
    const ids = replyMessageIds('<abc@inbox.example.org>', '<first@example.com> <abc@inbox.example.org>')
    expect(ids[0]).toBe('abc@inbox.example.org')
    expect(referenceExternalIds('email', ids[0]!)).toContain('email:out:abc@inbox.example.org')
  })
})
