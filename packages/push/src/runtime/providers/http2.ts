import type { ClientHttp2Session } from 'node:http2'
import type { Http2Request, Http2Response, Http2Transport } from './types'

/** Thrown when the runtime has no HTTP/2 client (Cloudflare Workers): APNs cannot be reached from it. */
export class Http2UnsupportedError extends Error {
  constructor(detail?: string) {
    super(`HTTP/2 is not available on this runtime${detail ? ` (${detail})` : ''}: APNs needs it. Send iOS pushes from a Node runtime, or through a relay.`)
    this.name = 'Http2UnsupportedError'
  }
}

/** A session with no request for this long is closed. */
const IDLE_MS = 60_000

type Http2Module = typeof import('node:http2')

/**
 * The default APNs transport: one `node:http2` session per origin, reused between requests and closed when it idles or
 * fails. `node:http2` is imported when first used, so a bundle for a runtime without it still loads. Node's global
 * `fetch` speaks HTTP/1.1 only, and APNs refuses that.
 */
export function createHttp2Transport(): Http2Transport {
  const sessions = new Map<string, ClientHttp2Session>()
  let loaded: Promise<Http2Module> | undefined

  const load = () => loaded ??= import('node:http2').then((module) => {
    // Workers' compat layer exposes the module without a working client.
    if (typeof module.connect !== 'function') throw new Http2UnsupportedError('no node:http2 client')
    return module
  }, (error: unknown) => {
    loaded = undefined
    throw new Http2UnsupportedError(error instanceof Error ? error.message : undefined)
  })

  async function sessionFor(origin: string): Promise<ClientHttp2Session> {
    const existing = sessions.get(origin)
    if (existing && !existing.closed && !existing.destroyed) return existing
    const http2 = await load()
    let session: ClientHttp2Session
    try {
      session = http2.connect(origin)
    }
    catch (error) {
      throw new Http2UnsupportedError(error instanceof Error ? error.message : undefined)
    }
    const forget = () => {
      if (sessions.get(origin) === session) sessions.delete(origin)
    }
    session.setTimeout(IDLE_MS, () => session.close())
    // A failed session is dropped (its pending requests see the error), the next push connects again.
    session.on('error', () => {
      forget()
      session.destroy()
    })
    session.on('close', forget)
    session.on('goaway', forget)
    // An idle session must not keep the process alive.
    session.unref()
    sessions.set(origin, session)
    return session
  }

  return async function request({ origin, path, headers, body, timeoutMs }: Http2Request): Promise<Http2Response> {
    const session = await sessionFor(origin)
    return new Promise<Http2Response>((resolve, reject) => {
      const stream = session.request({ ':method': 'POST', ':path': path, ...headers })
      let status = 0
      let text = ''
      let settled = false
      const finish = (action: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        action()
      }
      const timer = setTimeout(() => {
        finish(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })))
        stream.close()
      }, timeoutMs)
      stream.setEncoding('utf8')
      stream.on('response', (responseHeaders) => {
        status = Number(responseHeaders[':status'] ?? 0)
      })
      stream.on('data', (chunk: string) => {
        text += chunk
      })
      stream.on('end', () => finish(() => resolve({ status, body: text })))
      stream.on('error', error => finish(() => reject(error)))
      stream.on('close', () => finish(() => reject(new Error('The HTTP/2 stream closed before the response ended.'))))
      stream.end(body)
    })
  }
}

let shared: Http2Transport | undefined

/** The process-wide default transport, so every APNs sender shares one session per origin. */
export const defaultHttp2Transport: Http2Transport = request => (shared ??= createHttp2Transport())(request)
