import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { base64UrlEncode } from '../../src/runtime/utils/google'
import { clearGmailTokens, gmailCatchUp, gmailWatch, parseGmailPush } from '../../src/runtime/utils/gmail'
import type { GmailApiConfig } from '../../src/runtime/utils/gmail'

let config: GmailApiConfig

beforeAll(async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['sign', 'verify']) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keys.privateKey))
  config = {
    clientEmail: 'inbox@p.iam.gserviceaccount.com',
    privateKey: `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`,
    topic: 'projects/p/topics/inbox',
  }
})

const raw = (id: string) => `Message-ID: <${id}@example.com>\r\nFrom: kari@example.com\r\nTo: support@example.org\r\nSubject: Hi\r\n\r\nHello ${id}\r\n`

type Route = (url: URL, init: RequestInit) => Response | undefined
function mockGoogle(routes: Route[]) {
  const calls: Array<{ url: URL, init: RequestInit }> = []
  const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input))
    calls.push({ url, init })
    if (url.href === 'https://oauth2.googleapis.com/token') return Response.json({ access_token: 'ya29.token', expires_in: 3600 })
    for (const route of routes) {
      const response = route(url, init)
      if (response) return response
    }
    return new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

beforeEach(() => clearGmailTokens())
afterEach(() => vi.unstubAllGlobals())

describe('parseGmailPush', () => {
  it('reads the mailbox and the history id of a Pub/Sub push', () => {
    const data = base64UrlEncode(JSON.stringify({ emailAddress: 'Support@Example.org', historyId: 9876 }))
    expect(parseGmailPush({ message: { data, messageId: '1' }, subscription: 's' })).toEqual({ emailAddress: 'support@example.org', historyId: '9876' })
  })
  it('answers null for anything else', () => {
    expect(parseGmailPush(null)).toBeNull()
    expect(parseGmailPush({ message: {} })).toBeNull()
    expect(parseGmailPush({ message: { data: base64UrlEncode('{"emailAddress":"a@b.c"}') } })).toBeNull()
    expect(parseGmailPush({ message: { data: base64UrlEncode('not json') } })).toBeNull()
  })
})

describe('gmailCatchUp', () => {
  it('maps the history since the cursor to raw messages, oldest first, once each, skipping sent mail and drafts', async () => {
    const calls = mockGoogle([
      (url) => {
        if (url.pathname !== '/gmail/v1/users/me/history') return
        if (!url.searchParams.get('pageToken')) {
          return Response.json({
            history: [
              { messagesAdded: [{ message: { id: 'm1', labelIds: ['INBOX', 'UNREAD'] } }] },
              { messagesAdded: [{ message: { id: 'm2', labelIds: ['INBOX', 'SENT'] } }, { message: { id: 'm1', labelIds: ['INBOX'] } }] },
            ],
            nextPageToken: 'p2',
            historyId: '150',
          })
        }
        return Response.json({ history: [{ messagesAdded: [{ message: { id: 'm3', labelIds: ['INBOX'] } }, { message: { id: 'gone', labelIds: ['INBOX'] } }] }], historyId: '160' })
      },
      (url) => {
        const match = /^\/gmail\/v1\/users\/me\/messages\/(\w+)$/.exec(url.pathname)
        if (!match || match[1] === 'gone') return
        expect(url.searchParams.get('format')).toBe('raw')
        return Response.json({ id: match[1], raw: base64UrlEncode(raw(match[1]!)) })
      },
    ])
    const delivered: Array<[string, string]> = []
    const next = await gmailCatchUp({
      config,
      user: 'support@example.org',
      cursor: { historyId: '100', watchExpiration: 5 },
      deliver: async (bytes, id) => {
        delivered.push([id, new TextDecoder().decode(bytes)])
      },
    })
    expect(delivered.map(([id]) => id)).toEqual(['m1', 'm3'])
    expect(delivered[0]![1]).toBe(raw('m1'))
    expect(next).toEqual({ historyId: '160', watchExpiration: 5, delivered: 2 })
    const history = calls.find(call => call.url.pathname.endsWith('/history'))!
    expect(Object.fromEntries(history.url.searchParams)).toMatchObject({ startHistoryId: '100', historyTypes: 'messageAdded', labelId: 'INBOX' })
    expect((history.init.headers as Record<string, string>).authorization).toBe('Bearer ya29.token')
    // One token for every call.
    expect(calls.filter(call => call.url.host === 'oauth2.googleapis.com')).toHaveLength(1)
    const tokenBody = new URLSearchParams(calls[0]!.init.body as string)
    expect(tokenBody.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
  })
  it('keeps the cursor when a delivery fails, so the next push delivers again', async () => {
    mockGoogle([
      url => url.pathname.endsWith('/history') ? Response.json({ history: [{ messagesAdded: [{ message: { id: 'm1', labelIds: ['INBOX'] } }] }], historyId: '200' }) : undefined,
      url => url.pathname.includes('/messages/') ? Response.json({ raw: base64UrlEncode(raw('m1')) }) : undefined,
    ])
    await expect(gmailCatchUp({ config, user: 'support@example.org', cursor: { historyId: '100' }, deliver: async () => {
      throw new Error('database down')
    } })).rejects.toThrow('database down')
  })
  it('starts from the pushed history id without one, and takes nothing older in', async () => {
    const calls = mockGoogle([])
    const deliver = vi.fn()
    expect(await gmailCatchUp({ config, user: 'support@example.org', cursor: {}, startAt: '500', deliver })).toEqual({ historyId: '500', delivered: 0 })
    expect(deliver).not.toHaveBeenCalled()
    expect(calls.some(call => call.url.pathname.endsWith('/history'))).toBe(false)
  })
  it('starts over from the current history id when Gmail no longer has the stored one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockGoogle([
      url => url.pathname.endsWith('/history') ? new Response('{}', { status: 404 }) : undefined,
      url => url.pathname.endsWith('/profile') ? Response.json({ historyId: '900' }) : undefined,
    ])
    expect(await gmailCatchUp({ config, user: 'support@example.org', cursor: { historyId: '1' }, deliver: vi.fn() })).toEqual({ historyId: '900', delivered: 0 })
  })
  it('names the delegation when Google refuses a token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'unauthorized_client' }, { status: 401 })))
    await expect(gmailCatchUp({ config, user: 'support@example.org', cursor: { historyId: '1' }, deliver: vi.fn() })).rejects.toThrow('domain-wide delegation')
  })
})

describe('gmailWatch', () => {
  it('watches the inbox on the topic', async () => {
    const calls = mockGoogle([url => url.pathname.endsWith('/watch') ? Response.json({ historyId: '42', expiration: '1795000000000' }) : undefined])
    expect(await gmailWatch(config, 'ya29.token')).toEqual({ historyId: '42', expiration: 1795000000000 })
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ topicName: 'projects/p/topics/inbox', labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' })
  })
})
