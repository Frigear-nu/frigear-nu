import { createServer } from 'node:http2'
import type { Http2Server } from 'node:http2'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHttp2Transport } from '../../src/runtime/providers/http2'

// The real transport, against a local HTTP/2 server (cleartext h2c, which `node:http2` also speaks): APNs refuses
// HTTP/1.1, which is all `fetch` speaks on Node, so this is the path every iOS push takes.
describe('the node:http2 transport', () => {
  let server: Http2Server
  let origin: string
  let connections = 0
  const seen: Array<{ method: string, path: string, headers: Record<string, unknown>, body: string }> = []

  beforeAll(async () => {
    server = createServer()
    server.on('connection', () => connections++)
    server.on('stream', (stream, headers) => {
      let body = ''
      stream.setEncoding('utf8')
      stream.on('data', (chunk: string) => (body += chunk))
      stream.on('end', () => {
        seen.push({ method: String(headers[':method']), path: String(headers[':path']), headers, body })
        if (String(headers[':path']).includes('slow')) return
        const dead = String(headers[':path']).includes('dead')
        stream.respond({ ':status': dead ? 410 : 200, 'content-type': 'application/json' })
        stream.end(dead ? JSON.stringify({ reason: 'Unregistered' }) : '')
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

  it('posts over HTTP/2 and answers the status and body, on one reused session', async () => {
    const transport = createHttp2Transport()
    const headers = { 'authorization': 'bearer jwt', 'apns-topic': 'com.example.app', 'content-type': 'application/json' }
    const sent = await transport({ origin, path: '/3/device/abc', headers, body: '{"aps":{}}', timeoutMs: 2000 })
    expect(sent).toEqual({ status: 200, body: '' })
    const dead = await transport({ origin, path: '/3/device/dead', headers, body: '{}', timeoutMs: 2000 })
    expect(dead).toEqual({ status: 410, body: '{"reason":"Unregistered"}' })

    expect(seen[0]).toMatchObject({ method: 'POST', path: '/3/device/abc', body: '{"aps":{}}' })
    expect(seen[0]!.headers).toMatchObject({ 'authorization': 'bearer jwt', 'apns-topic': 'com.example.app' })
    expect(connections).toBe(1)
  })

  it('times out a request the server never answers', async () => {
    const transport = createHttp2Transport()
    await expect(transport({ origin, path: '/3/device/slow', headers: {}, body: '{}', timeoutMs: 50 })).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('rejects when the server is not there, and connects again for the next push', async () => {
    const transport = createHttp2Transport()
    await expect(transport({ origin: 'http://127.0.0.1:1', path: '/3/device/x', headers: {}, body: '{}', timeoutMs: 500 })).rejects.toBeInstanceOf(Error)
    expect(await transport({ origin, path: '/3/device/again', headers: {}, body: '{}', timeoutMs: 2000 })).toMatchObject({ status: 200 })
  })
})
