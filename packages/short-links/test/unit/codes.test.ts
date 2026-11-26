import { describe, expect, it } from 'vitest'
import {
  BASE62,
  SHORT_CODE_LENGTH,
  isLinkScanner,
  isShortLinkSubject,
  isVanityCode,
  normalizeShortLinkTarget,
  randomShortCode,
  shortLinkPath,
} from '../../src/runtime/utils/codes'

describe('randomShortCode', () => {
  it('draws 7 base62 characters by default', () => {
    for (let i = 0; i < 200; i++) {
      const code = randomShortCode()
      expect(code).toHaveLength(SHORT_CODE_LENGTH)
      expect(code).toMatch(/^[0-9A-Z]+$/i)
    }
  })

  it('takes another length', () => {
    expect(randomShortCode(12)).toHaveLength(12)
    expect(randomShortCode(1)).toHaveLength(1)
  })

  it('rarely repeats and uses the whole alphabet', () => {
    const codes = new Set(Array.from({ length: 5000 }, () => randomShortCode()))
    expect(codes.size).toBe(5000)
    const seen = new Set([...codes].join(''))
    expect(seen.size).toBe(BASE62.length)
  })
})

describe('isVanityCode', () => {
  it.each(['spring', 'Summer-2030', 'a_b', 'x7G', 'a'.repeat(64)])('accepts %s', (code) => {
    expect(isVanityCode(code)).toBe(true)
  })

  it.each(['', 'ab', '-start', '_start', 'has space', 'slash/inside', 'dot.inside', 'æøå', 'a'.repeat(65), '../x'])('refuses %j', (code) => {
    expect(isVanityCode(code)).toBe(false)
  })
})

describe('isShortLinkSubject', () => {
  it('accepts URL-safe tokens up to 200 characters', () => {
    expect(isShortLinkSubject('dlv_3f2c9a')).toBe(true)
    expect(isShortLinkSubject('a.b~c-d_e')).toBe(true)
    expect(isShortLinkSubject('x'.repeat(200))).toBe(true)
  })

  it('refuses anything else', () => {
    expect(isShortLinkSubject('')).toBe(false)
    expect(isShortLinkSubject('x'.repeat(201))).toBe(false)
    expect(isShortLinkSubject('a/b')).toBe(false)
    expect(isShortLinkSubject('<script>')).toBe(false)
  })
})

describe('normalizeShortLinkTarget', () => {
  it('accepts http and https URLs', () => {
    expect(normalizeShortLinkTarget('https://example.com/apply?x=1#top')).toBe('https://example.com/apply?x=1#top')
    expect(normalizeShortLinkTarget('  http://Example.com  ')).toBe('http://example.com/')
  })

  it.each([
    '',
    'example.com',
    '/relative/path',
    '//example.com/protocol-relative',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.com/file',
    'mailto:someone@example.com',
    'https://user:pass@example.com/',
    'https://',
    `https://example.com/${'a'.repeat(2048)}`,
  ])('refuses %j', (value) => {
    expect(normalizeShortLinkTarget(value)).toBeNull()
  })
})

describe('isLinkScanner', () => {
  const browsers = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
  ]
  it.each(browsers)('counts a browser: %s', (ua) => {
    expect(isLinkScanner(ua)).toBe(false)
  })

  const scanners = [
    undefined,
    '',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'WhatsApp/2.23.20.0',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0 BingPreview/1.0b',
    'Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0.17531; Pro)',
    'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/124.0.0.0 Safari/537.36',
    'python-requests/2.31.0',
    'curl/8.4.0',
    'node',
  ]
  it.each(scanners)('does not count a scanner: %s', (ua) => {
    expect(isLinkScanner(ua)).toBe(true)
  })
})

describe('shortLinkPath', () => {
  it('joins the path, code and subject', () => {
    expect(shortLinkPath('/l', 'abc1234')).toBe('/l/abc1234')
    expect(shortLinkPath('/l/', 'abc1234', 'dlv_1')).toBe('/l/abc1234/dlv_1')
    expect(shortLinkPath('go', 'spring')).toBe('/go/spring')
    expect(shortLinkPath('/', 'spring')).toBe('/spring')
  })
})
