// Minimal AWS Signature V4 (header-based) on Web Crypto - enough to sign a single JSON POST.
const encoder = new TextEncoder()

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')

const sha256Hex = async (data: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(data)))

async function hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
  const raw = typeof key === 'string' ? encoder.encode(key) : key
  const cryptoKey = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data))
}

export interface SignOptions {
  method: string
  url: string
  body: string
  region: string
  service: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  /** Injectable for tests. */
  now?: Date
}

/** Returns the headers (including `Authorization`) to send with the request. */
export async function signRequest(o: SignOptions): Promise<Record<string, string>> {
  const url = new URL(o.url)
  const amzDate = (o.now ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const payloadHash = await sha256Hex(o.body)

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'host': url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  }
  if (o.sessionToken) headers['x-amz-security-token'] = o.sessionToken

  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map(n => `${n}:${headers[n]!.trim()}\n`).join('')
  const signedHeaders = names.join(';')
  const canonicalRequest = [o.method, url.pathname, url.searchParams.toString(), canonicalHeaders, signedHeaders, payloadHash].join('\n')

  const scope = `${dateStamp}/${o.region}/${o.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')

  const kDate = await hmac(`AWS4${o.secretAccessKey}`, dateStamp)
  const kRegion = await hmac(kDate, o.region)
  const kService = await hmac(kRegion, o.service)
  const kSigning = await hmac(kService, 'aws4_request')
  const signature = hex(await hmac(kSigning, stringToSign))

  const { host: _host, ...sendable } = headers
  return {
    ...sendable,
    Authorization: `AWS4-HMAC-SHA256 Credential=${o.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}
