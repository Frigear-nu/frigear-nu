import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { applyBearerCors, isLoopbackAnyPortOrigin, matchesCorsOrigin, matchesPathPrefix } from '../src/runtime/server'

const makeEvent = (method: string, origin?: string): H3Event => {
  const req = new IncomingMessage(new Socket())
  req.url = '/api/x'
  req.method = method
  req.headers = { host: 'example.test', ...(origin ? { origin } : {}) }
  return createEvent(req, new ServerResponse(req))
}

const headers = (event: H3Event) => event.node.res.getHeaders()
const options = { origins: ['capacitor://localhost', 'https://app.example.com'], methods: ['GET', 'POST', 'OPTIONS'] }

describe('applyBearerCors', () => {
  it('answers a preflight from an allowed origin with 204 and the headers, never credentials', () => {
    const event = makeEvent('OPTIONS', 'capacitor://localhost')
    expect(applyBearerCors(event, options)).toBe(true)
    expect(event.node.res.statusCode).toBe(204)
    expect(headers(event)).toMatchObject({
      'vary': 'Origin',
      'access-control-allow-origin': 'capacitor://localhost',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '600',
    })
    expect(headers(event)['access-control-allow-credentials']).toBeUndefined()
    expect(headers(event)['access-control-expose-headers']).toBeUndefined()
  })

  it('adds the headers to real requests without ending them', () => {
    const event = makeEvent('GET', 'https://app.example.com')
    const handled = applyBearerCors(event, { ...options, methods: 'GET, OPTIONS', allowHeaders: ['authorization', 'accept'], exposeHeaders: ['www-authenticate'], maxAge: 60 })
    expect(handled).toBe(false)
    expect(event.node.res.statusCode).toBe(200)
    expect(headers(event)).toMatchObject({
      'access-control-allow-origin': 'https://app.example.com',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'authorization, accept',
      'access-control-expose-headers': 'www-authenticate',
      'access-control-max-age': '60',
    })
  })

  it.each([undefined, 'https://evil.example.com', 'null', '*', 'capacitor://localhost.evil.com'])('gives the origin %j nothing but Vary', (origin) => {
    const event = makeEvent('OPTIONS', origin)
    expect(applyBearerCors(event, { ...options, origins: [...options.origins, '*'] })).toBe(false)
    expect(event.node.res.statusCode).toBe(200)
    expect(headers(event).vary).toBe('Origin')
    expect(headers(event)['access-control-allow-origin']).toBeUndefined()
    expect(headers(event)['access-control-allow-methods']).toBeUndefined()
  })

  it('keeps an existing Vary header', () => {
    const event = makeEvent('GET', 'capacitor://localhost')
    event.node.res.setHeader('vary', 'Accept-Encoding')
    applyBearerCors(event, options)
    expect(String(headers(event).vary)).toMatch(/Accept-Encoding.*Origin/)
  })
})

describe('matchesCorsOrigin', () => {
  it('matches exact origins', () => {
    expect(matchesCorsOrigin('https://app.example.com', ['https://app.example.com'])).toBe(true)
    expect(matchesCorsOrigin('https://app.example.com:8443', ['https://app.example.com'])).toBe(false)
    expect(matchesCorsOrigin('*', ['*'])).toBe(false)
    expect(matchesCorsOrigin('', [''])).toBe(false)
  })

  it('matches a loopback IP on any port only for the loopback wildcard entries', () => {
    const allowed = ['http://127.0.0.1:*', 'http://[::1]:*']
    expect(matchesCorsOrigin('http://127.0.0.1:47615', allowed)).toBe(true)
    expect(matchesCorsOrigin('http://[::1]:1', allowed)).toBe(true)
    expect(matchesCorsOrigin('http://127.0.0.1:47615', ['http://[::1]:*'])).toBe(false)
    for (const origin of ['http://127.0.0.1', 'http://127.0.0.1:0', 'http://127.0.0.1:65536', 'http://127.0.0.1:080', 'https://127.0.0.1:443', 'http://localhost:3000', 'http://127.0.0.2:80', 'http://127.0.0.1.evil.test:80', 'http://127.0.0.1:80/path']) {
      expect(matchesCorsOrigin(origin, allowed), origin).toBe(false)
    }
    // A wildcard entry for another host never matches.
    expect(matchesCorsOrigin('https://app.example.com:1', ['https://app.example.com:*'])).toBe(false)
  })

  it('lets applyBearerCors answer a loopback origin on any port, echoing the exact origin', () => {
    const event = makeEvent('OPTIONS', 'http://127.0.0.1:51234')
    expect(applyBearerCors(event, { origins: ['http://127.0.0.1:*'], methods: 'GET, OPTIONS' })).toBe(true)
    expect(headers(event)['access-control-allow-origin']).toBe('http://127.0.0.1:51234')
  })

  it('names the loopback wildcard entries', () => {
    expect(isLoopbackAnyPortOrigin('http://127.0.0.1:*')).toBe(true)
    expect(isLoopbackAnyPortOrigin('http://[::1]:*')).toBe(true)
    expect(isLoopbackAnyPortOrigin('http://localhost:*')).toBe(false)
    expect(isLoopbackAnyPortOrigin('https://127.0.0.1:*')).toBe(false)
  })
})

describe('matchesPathPrefix', () => {
  it('matches the prefix and everything below it, with or without the trailing slash', () => {
    expect(matchesPathPrefix('/api/x', ['/api/'])).toBe(true)
    expect(matchesPathPrefix('/api', ['/api/'])).toBe(true)
    expect(matchesPathPrefix('/api/x', ['/api'])).toBe(true)
    expect(matchesPathPrefix('/apix', ['/api'])).toBe(false)
    expect(matchesPathPrefix('/apix', ['/api/'])).toBe(false)
    expect(matchesPathPrefix('/other', [])).toBe(false)
  })
})
