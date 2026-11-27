import { describe, expect, it, vi } from 'vitest'
import PostalMime from 'postal-mime'
import { createCloudflareBindingDriver } from '../src/runtime/drivers/email/cloudflare-binding'
import { buildMimeMessage, encodeHeaderWords, formatAddressHeader, generateMessageId } from '../src/runtime/drivers/email/mime'
import { createSesDriver } from '../src/runtime/drivers/email/ses'

class FakeEmailMessage {
  constructor(public from: string, public to: string, public raw: string) {}
}

function fakeBinding() {
  const sent: FakeEmailMessage[] = []
  return { sent, binding: { send: vi.fn(async (message: unknown) => {
    sent.push(message as FakeEmailMessage)
  }) } }
}

const mail = { to: 'kari@example.com', subject: 'Re: Spørgsmål om vagter [ibt_abc12345]', body: '<p>Hej Kari</p>', text: 'Hej Kari', replyTo: 'support+ibt_abc12345@inbox.x.test' }

describe('mime', () => {
  it('encodes non-ASCII header words as RFC 2047 and leaves ASCII alone', () => {
    expect(encodeHeaderWords('Hello')).toBe('Hello')
    expect(encodeHeaderWords('Blåbærgrød')).toBe(`=?UTF-8?B?${Buffer.from('Blåbærgrød').toString('base64')}?=`)
    const long = encodeHeaderWords('æ'.repeat(60))
    for (const word of long.split(' ')) expect(word.length).toBeLessThanOrEqual(75)
    expect(encodeHeaderWords('a\r\nBcc: evil@x.test')).toBe('a Bcc: evil@x.test')
  })
  it('formats addresses with quoted or encoded names', () => {
    expect(formatAddressHeader('a@x.test')).toBe('a@x.test')
    expect(formatAddressHeader('"Support" <s@x.test>')).toBe('"Support" <s@x.test>')
    expect(formatAddressHeader('Frivillig Æblegrød <s@x.test>')).toMatch(/^=\?UTF-8\?B\?.+\?= <s@x\.test>$/)
  })
  it('generates a Message-ID on the sender domain', () => {
    const id = generateMessageId('"Support" <support@Inbox.X.test>')
    expect(id).toMatch(/^[0-9a-f]{32}@inbox\.x\.test$/)
    expect(generateMessageId('support@inbox.x.test')).not.toBe(id)
  })
  it('builds a message postal-mime reads back', async () => {
    const raw = buildMimeMessage({
      from: 'Støtte <support@inbox.x.test>',
      to: ['kari@example.com'],
      cc: ['ola@example.com'],
      replyTo: mail.replyTo,
      subject: mail.subject,
      html: '<p>Hej æøå</p>',
      text: 'Hej æøå',
      headers: { 'In-Reply-To': '<a@example.com>', 'References': '<a@example.com>', 'Message-ID': '<forged@x>', 'Bad Name': 'x' },
      messageId: 'abc@inbox.x.test',
    })
    expect(raw).not.toContain('forged')
    expect(raw).not.toContain('Bad Name')
    expect(raw.split('\r\n').every(line => line.length <= 998)).toBe(true)
    const parsed = await PostalMime.parse(raw)
    expect(parsed.messageId).toBe('<abc@inbox.x.test>')
    expect(parsed.subject).toBe(mail.subject)
    expect(parsed.from).toMatchObject({ address: 'support@inbox.x.test', name: 'Støtte' })
    expect(parsed.to?.[0]).toMatchObject({ address: 'kari@example.com' })
    expect(parsed.cc?.[0]).toMatchObject({ address: 'ola@example.com' })
    expect(parsed.replyTo?.[0]).toMatchObject({ address: mail.replyTo })
    expect(parsed.inReplyTo).toBe('<a@example.com>')
    expect(parsed.text?.trim()).toBe('Hej æøå')
    expect(parsed.html?.trim()).toBe('<p>Hej æøå</p>')
  })
  it('builds a single part message without an html body', async () => {
    const raw = buildMimeMessage({ from: 'a@x.test', to: ['b@x.test'], subject: 'Hi', text: 'Plain', messageId: 'm@x.test' })
    expect(raw).not.toContain('multipart')
    expect((await PostalMime.parse(raw)).text?.trim()).toBe('Plain')
  })
})

describe('cloudflare-binding', () => {
  it('sends one EmailMessage per recipient with the same raw message, and returns its Message-ID', async () => {
    const { sent, binding } = fakeBinding()
    const driver = createCloudflareBindingDriver({ from: 'Frigear <no-reply@x.test>' }, { env: { SEND_EMAIL: binding }, EmailMessage: FakeEmailMessage })
    const result = await driver({ ...mail, from: '"Support" <support@inbox.x.test>', cc: ['ola@example.com', 'kari@example.com'], headers: { 'In-Reply-To': '<a@example.com>' } })
    expect(result?.messageId).toMatch(/^[0-9a-f]{32}@inbox\.x\.test$/)
    expect(sent.map(message => [message.from, message.to])).toEqual([['support@inbox.x.test', 'kari@example.com'], ['support@inbox.x.test', 'ola@example.com']])
    expect(sent[0]!.raw).toBe(sent[1]!.raw)
    const parsed = await PostalMime.parse(sent[0]!.raw)
    expect(parsed.messageId).toBe(`<${result!.messageId}>`)
    expect(parsed.inReplyTo).toBe('<a@example.com>')
  })
  it('uses a configured binding name and the configured from', async () => {
    const { sent, binding } = fakeBinding()
    await createCloudflareBindingDriver({ from: 'no-reply@x.test', name: 'MAIL' }, { env: { MAIL: binding }, EmailMessage: FakeEmailMessage })(mail)
    expect(sent[0]!.from).toBe('no-reply@x.test')
  })
  it('names the missing binding', async () => {
    await expect(createCloudflareBindingDriver({ from: 'a@x.test' }, { env: {}, EmailMessage: FakeEmailMessage })(mail)).rejects.toThrow('SEND_EMAIL')
  })
  it('fails off Workers, where cloudflare:email does not exist', async () => {
    const { binding } = fakeBinding()
    await expect(createCloudflareBindingDriver({ from: 'a@x.test' }, { env: { SEND_EMAIL: binding } })(mail)).rejects.toThrow('only runs on Cloudflare Workers')
  })
})

describe('ses', () => {
  it('encodes a non-ASCII display name in FromEmailAddress', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await createSesDriver({ region: 'eu-west-1', accessKeyId: 'AKID', secretAccessKey: 'secret', from: 'me@x.test' })({ ...mail, from: '"Frivillig Støtte" <support@x.test>' })
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.FromEmailAddress).toBe(`=?UTF-8?B?${Buffer.from('Frivillig Støtte').toString('base64')}?= <support@x.test>`)
    vi.unstubAllGlobals()
  })
})
