import { describe, expect, it } from 'vitest'
import type { H3Event } from 'h3'
import { createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { fillI18nBaseUrl } from '../src/runtime/server/i18n-base-url'

const makeEvent = (headers: Record<string, string>): H3Event => {
  const req = new IncomingMessage(new Socket())
  req.url = '/en/about'
  req.method = 'GET'
  req.headers = headers
  return createEvent(req, new ServerResponse(req))
}

describe('fillI18nBaseUrl', () => {
  it('fills an empty base URL with the request origin', () => {
    const config = { public: { i18n: { baseUrl: '' } } }
    expect(fillI18nBaseUrl(makeEvent({ host: 'pr-12.example.pages.dev' }), config)).toBe('http://pr-12.example.pages.dev')
    expect(config.public.i18n.baseUrl).toBe('http://pr-12.example.pages.dev')
  })

  it('follows the forwarded host and protocol of a proxy', () => {
    const config = { public: { i18n: { baseUrl: '' } } }
    fillI18nBaseUrl(makeEvent({ 'host': 'localhost:3000', 'x-forwarded-host': 'preview.example.dev', 'x-forwarded-proto': 'https' }), config)
    expect(config.public.i18n.baseUrl).toBe('https://preview.example.dev')
  })

  it('keeps an explicit base URL', () => {
    const config = { public: { i18n: { baseUrl: 'https://example.com' } } }
    expect(fillI18nBaseUrl(makeEvent({ host: 'pr-12.example.pages.dev' }), config)).toBeUndefined()
    expect(config.public.i18n.baseUrl).toBe('https://example.com')
  })

  it('does nothing without i18n', () => {
    const config: { public: { i18n?: { baseUrl?: string } } } = { public: {} }
    expect(fillI18nBaseUrl(makeEvent({ host: 'example.test' }), config)).toBeUndefined()
    expect(config.public.i18n).toBeUndefined()
  })
})
