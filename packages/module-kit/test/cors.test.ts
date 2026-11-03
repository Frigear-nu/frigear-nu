import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { applyBearerCors, matchesPathPrefix } from '../src/runtime/server'

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
