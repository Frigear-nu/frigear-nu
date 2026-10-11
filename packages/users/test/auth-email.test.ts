import { describe, expect, it } from 'vitest'
import { buildMagicLinkNotification, buildVerifyEmailNotification } from '../src/runtime/server/utils/auth-email'
import { isInternalPath } from '../src/runtime/server/utils/redirect'

describe('auth email notifications', () => {
  const input = { to: 'user@example.com', name: 'Ada <script>', url: 'https://example.com/auth/magic-link?code=abc&x=1' }

  it('builds a magic link email with the url in both bodies and the name escaped', () => {
    const notification = buildMagicLinkNotification(input)
    expect(notification.to).toBe('user@example.com')
    expect(notification.body).toContain('code=abc&amp;x=1')
    expect(notification.body).not.toContain('<script>')
    expect(notification.text).toContain(input.url)
  })

  it('builds a verification email with its own subject', () => {
    const notification = buildVerifyEmailNotification(input)
    expect(notification.subject).not.toBe(buildMagicLinkNotification(input).subject)
    expect(notification.text).toContain(input.url)
  })
})

describe('isInternalPath', () => {
  it('only accepts same-origin absolute paths', () => {
    expect(isInternalPath('/account')).toBe(true)
    expect(isInternalPath('/oauth/authorize?client_id=1')).toBe(true)
    expect(isInternalPath('//evil.example')).toBe(false)
    expect(isInternalPath('/\\evil.example')).toBe(false)
    expect(isInternalPath('https://evil.example')).toBe(false)
    expect(isInternalPath(undefined)).toBe(false)
  })
})
