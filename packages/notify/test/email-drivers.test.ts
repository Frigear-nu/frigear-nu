import { afterEach, describe, expect, it, vi } from 'vitest'
import { createResendDriver } from '../src/runtime/drivers/email/resend'
import { createCloudflareDriver } from '../src/runtime/drivers/email/cloudflare'
import { createSesDriver } from '../src/runtime/drivers/email/ses'
import { signRequest } from '../src/runtime/drivers/email/sigv4'

const mail = { to: ['a@x.test', 'b@x.test'], subject: 'Hi', body: '<p>Hi</p>', text: 'Hi', replyTo: 'r@x.test' }

function mockFetch(status = 200, body = '{}') {
  const fn = vi.fn(async () => new Response(body, { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}
const call = (fn: ReturnType<typeof mockFetch>) => {
  const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
  return { url, init, headers: init.headers as Record<string, string>, json: JSON.parse(init.body as string) }
}

afterEach(() => vi.unstubAllGlobals())

describe('resend', () => {
  it('posts the mail', async () => {
    const f = mockFetch()
    await createResendDriver({ apiToken: 'tok', from: 'me@x.test' })(mail)
    const { url, headers, json } = call(f)
    expect(url).toBe('https://api.resend.com/emails')
    expect(headers.Authorization).toBe('Bearer tok')
    expect(json).toEqual({ from: 'me@x.test', to: mail.to, subject: 'Hi', html: '<p>Hi</p>', text: 'Hi', reply_to: 'r@x.test' })
  })
  it('names the missing env var', async () => {
    mockFetch()
    await expect(createResendDriver({ from: 'me@x.test' })(mail)).rejects.toThrow('NUXT_NOTIFY_EMAIL_RESEND_API_TOKEN')
    await expect(createResendDriver({ apiToken: 't' })(mail)).rejects.toThrow('NUXT_NOTIFY_EMAIL_FROM')
  })
  it('throws with the response body on failure', async () => {
    mockFetch(422, 'bad address')
    await expect(createResendDriver({ apiToken: 't', from: 'f@x.test' })(mail)).rejects.toThrow('422: bad address')
  })
  it('wraps a single recipient in an array', async () => {
    const f = mockFetch()
    await createResendDriver({ apiToken: 't', from: 'f@x.test' })({ ...mail, to: 'a@x.test' })
    expect(call(f).json.to).toEqual(['a@x.test'])
  })
})

describe('cloudflare', () => {
  it('posts to the account endpoint', async () => {
    const f = mockFetch()
    await createCloudflareDriver({ accountId: 'acc', apiToken: 'tok', from: 'me@x.test' })(mail)
    const { url, headers, json } = call(f)
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc/email/sending/send')
    expect(headers.Authorization).toBe('Bearer tok')
    expect(json.to).toEqual(mail.to)
    expect(json.html).toBe('<p>Hi</p>')
  })
  it('names the missing env var', async () => {
    await expect(createCloudflareDriver({ apiToken: 't', from: 'f' })(mail)).rejects.toThrow('NUXT_NOTIFY_EMAIL_CLOUDFLARE_ACCOUNT_ID')
  })
})

describe('ses', () => {
  const config = { region: 'eu-west-1', accessKeyId: 'AKID', secretAccessKey: 'secret', from: 'me@x.test' }
  it('posts a signed SES v2 request', async () => {
    const f = mockFetch()
    await createSesDriver({ ...config, sessionToken: 'sess' })(mail)
    const { url, headers, json } = call(f)
    expect(url).toBe('https://email.eu-west-1.amazonaws.com/v2/email/outbound-emails')
    expect(headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/\d{8}\/eu-west-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token, Signature=[0-9a-f]{64}$/)
    expect(headers['x-amz-security-token']).toBe('sess')
    expect(headers.host).toBeUndefined()
    expect(json.Destination.ToAddresses).toEqual(mail.to)
    expect(json.Content.Simple.Body.Text.Data).toBe('Hi')
    expect(json.ReplyToAddresses).toEqual(['r@x.test'])
  })
  it('names the missing env var', async () => {
    await expect(createSesDriver({ ...config, region: '' })(mail)).rejects.toThrow('NUXT_NOTIFY_EMAIL_SES_REGION')
  })
})

describe('sigv4', () => {
  // Deterministic: same input must yield the same signature, and it must change with the secret.
  const base = { method: 'POST', url: 'https://email.us-east-1.amazonaws.com/v2/email/outbound-emails', body: '{}', region: 'us-east-1', service: 'ses', accessKeyId: 'AKID', now: new Date('2015-08-30T12:36:00Z') }
  it('is deterministic and secret-dependent', async () => {
    const a = await signRequest({ ...base, secretAccessKey: 's1' })
    expect((await signRequest({ ...base, secretAccessKey: 's1' })).Authorization).toBe(a.Authorization)
    expect((await signRequest({ ...base, secretAccessKey: 's2' })).Authorization).not.toBe(a.Authorization)
    expect(a['x-amz-date']).toBe('20150830T123600Z')
  })
})
