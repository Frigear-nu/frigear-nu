import { describe, expect, it } from 'vitest'
import {
  cleanSubject,
  displayNameOf,
  emailCc,
  emailRecipients,
  emailToInbound,
  htmlToText,
  inboxEmailPayload,
  metaSendRequest,
  metaSentId,
  normaliseEmail,
  parseMetaWebhook,
  threadIdFromSubject,
} from '../../src/runtime/utils/payloads'

const THREAD = 'ibt_0123456789abcdef0123456789abcdef'

describe('email payloads', () => {
  it('normalises addresses and reads display names', () => {
    expect(normaliseEmail('Kari Nordmann <Kari@Example.ORG>')).toBe('kari@example.org')
    expect(normaliseEmail(' support@example.com ')).toBe('support@example.com')
    expect(displayNameOf('"Kari Nordmann" <kari@example.org>')).toBe('Kari Nordmann')
    expect(displayNameOf('kari@example.org')).toBeNull()
  })

  it('finds the thread marker and cleans the subject', () => {
    expect(threadIdFromSubject(`Re: Tickets [${THREAD}]`)).toBe(THREAD)
    expect(threadIdFromSubject('Tickets')).toBeNull()
    expect(cleanSubject(`SV: Re: Tickets [${THREAD}]`)).toBe('Tickets')
    expect(cleanSubject('  ')).toBeNull()
  })

  it('turns HTML into text', () => {
    expect(htmlToText('<p>Hello &amp; welcome</p><p>Line<br>two</p><script>x()</script>')).toBe('Hello & welcome\nLine\ntwo')
  })

  it('parses a provider-agnostic email into an inbound message', () => {
    const payload = inboxEmailPayload.parse({
      messageId: '<abc@mail>',
      from: 'Kari Nordmann <Kari@Example.org>',
      to: ['Support@example.com', { email: 'other@example.com' }],
      subject: `Re: Tickets [${THREAD}]`,
      html: '<p>Hi</p>',
      attachments: [{ filename: 'ticket.pdf', contentType: 'application/pdf', size: 1200, url: 'https://files.example/ticket.pdf' }],
    })
    expect(emailRecipients(payload)).toEqual(['support@example.com', 'other@example.com'])
    expect(emailToInbound(payload, 'support@example.com')).toEqual({
      address: 'support@example.com',
      contact: { externalId: 'kari@example.org', email: 'kari@example.org', name: 'Kari Nordmann' },
      externalId: '<abc@mail>',
      subject: 'Tickets',
      body: 'Hi',
      attachments: [{ filename: 'ticket.pdf', contentType: 'application/pdf', size: 1200, url: 'https://files.example/ticket.pdf' }],
      cc: [],
      threadId: THREAD,
      authenticated: false,
    })
    expect(emailToInbound({ ...payload, authenticated: true }, 'support@example.com').authenticated).toBe(true)
  })

  it('reads the cc recipients, without the mailbox itself', () => {
    const payload = inboxEmailPayload.parse({
      messageId: '<cc@mail>',
      from: 'kari@example.org',
      to: 'board@example.com',
      cc: ['Ola <Ola@Example.org>', { email: 'support@example.com' }, 'ola@example.org', { email: 'Lise@Example.org', name: 'Lise' }],
      text: 'Hi',
    })
    expect(emailCc(payload, 'support@example.com')).toEqual(['ola@example.org', 'lise@example.org'])
    expect(emailToInbound(payload, 'support@example.com').cc).toEqual(['ola@example.org', 'lise@example.org'])
    expect(emailCc(inboxEmailPayload.parse({ messageId: '1', from: 'a@b.c', to: 'x@y.z', cc: 'Ola <ola@example.org>' }))).toEqual(['ola@example.org'])
    expect(emailCc(inboxEmailPayload.parse({ messageId: '1', from: 'a@b.c', to: 'x@y.z' }))).toEqual([])
  })

  it('refuses a body that is not an email', () => {
    expect(inboxEmailPayload.safeParse({ from: 'a@b.c', to: 'x@y.z' }).success).toBe(false)
    expect(inboxEmailPayload.safeParse({ messageId: '1', from: 'a@b.c', to: [] }).success).toBe(false)
  })
})

describe('meta payloads', () => {
  it('reads WhatsApp text and media messages and skips statuses', () => {
    const messages = parseMetaWebhook({
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: 'PNID' },
            contacts: [{ wa_id: '4511111111', profile: { name: 'Ola' } }],
            messages: [
              { from: '4511111111', id: 'wamid.1', type: 'text', text: { body: 'Hej' } },
              { from: '4511111111', id: 'wamid.2', type: 'image', image: { id: 'media1', mime_type: 'image/jpeg', caption: 'Look' } },
            ],
            statuses: [{ id: 'wamid.0', status: 'read' }],
          },
        }],
      }],
    })
    expect(messages).toEqual([
      { channel: 'whatsapp', address: 'PNID', contact: { externalId: '4511111111', phone: '+4511111111', name: 'Ola' }, externalId: 'wamid.1', body: 'Hej', attachments: [], authenticated: true },
      { channel: 'whatsapp', address: 'PNID', contact: { externalId: '4511111111', phone: '+4511111111', name: 'Ola' }, externalId: 'wamid.2', body: 'Look', attachments: [{ filename: 'image-media1', contentType: 'image/jpeg' }], authenticated: true },
    ])
  })

  it('reads Messenger and Instagram messages and skips echoes of our own replies', () => {
    const page = parseMetaWebhook({
      object: 'page',
      entry: [{
        id: 'PAGE',
        messaging: [
          { sender: { id: 'PSID' }, recipient: { id: 'PAGE' }, message: { mid: 'm1', text: 'Hi' } },
          { sender: { id: 'PAGE' }, recipient: { id: 'PSID' }, message: { mid: 'm2', text: 'Our reply', is_echo: true } },
          { sender: { id: 'PSID' }, recipient: { id: 'PAGE' }, read: { watermark: 1 } },
        ],
      }],
    })
    expect(page).toEqual([{ channel: 'messenger', address: 'PAGE', contact: { externalId: 'PSID' }, externalId: 'm1', body: 'Hi', attachments: [], authenticated: true }])

    const instagram = parseMetaWebhook({
      object: 'instagram',
      entry: [{ id: 'IG', messaging: [{ sender: { id: 'IGSID' }, recipient: { id: 'IG' }, message: { mid: 'ig1', attachments: [{ type: 'image', payload: { url: 'https://cdn.example/1.jpg' } }] } }] }],
    })
    expect(instagram).toEqual([{ channel: 'instagram', address: 'IG', contact: { externalId: 'IGSID' }, externalId: 'ig1', body: '[image-1]', attachments: [{ filename: 'image-1', url: 'https://cdn.example/1.jpg' }], authenticated: true }])
  })

  it('ignores anything it does not know', () => {
    expect(parseMetaWebhook(null)).toEqual([])
    expect(parseMetaWebhook({ object: 'user', entry: [] })).toEqual([])
    expect(parseMetaWebhook({ object: 'page', entry: 'nope' })).toEqual([])
  })

  it('builds the Graph API send call and reads the sent id', () => {
    const options = { apiBase: 'https://graph.facebook.com/', apiVersion: 'v21.0', accountId: 'PNID', recipient: '4511111111', text: 'Hej' }
    expect(metaSendRequest('whatsapp', options)).toEqual({
      url: 'https://graph.facebook.com/v21.0/PNID/messages',
      body: { messaging_product: 'whatsapp', recipient_type: 'individual', to: '4511111111', type: 'text', text: { preview_url: false, body: 'Hej' } },
    })
    expect(metaSendRequest('messenger', { ...options, accountId: 'PAGE', recipient: 'PSID' }).body).toEqual({ recipient: { id: 'PSID' }, messaging_type: 'RESPONSE', message: { text: 'Hej' } })
    expect(metaSentId({ messages: [{ id: 'wamid.9' }] })).toBe('wamid.9')
    expect(metaSentId({ recipient_id: 'PSID', message_id: 'm_9' })).toBe('m_9')
    expect(metaSentId('nope')).toBeNull()
  })
})
