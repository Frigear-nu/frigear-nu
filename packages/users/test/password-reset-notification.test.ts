import { describe, expect, it } from 'vitest'
import { buildPasswordResetNotification } from '../src/runtime/server/utils/password-reset'

describe('buildPasswordResetNotification', () => {
  it('builds an EmailNotification addressed to the user with the reset url in both bodies', () => {
    const notification = buildPasswordResetNotification({
      to: 'user@example.com',
      resetUrl: 'https://example.com/reset-password?code=abc123',
    })

    expect(notification.to).toBe('user@example.com')
    expect(notification.subject).toBe('Reset your password')
    expect(notification.body).toContain('https://example.com/reset-password?code=abc123')
    expect(notification.text).toContain('https://example.com/reset-password?code=abc123')
  })
})
