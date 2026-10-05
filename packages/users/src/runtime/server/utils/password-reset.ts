import type { EmailNotification } from '@frigear-nu/notify/types'

export type PasswordResetEmailPayload = {
  to: string
  resetUrl: string
}

/**
 * Generates a URL-safe, unguessable code for a password reset request. Uses the Web Crypto API
 * (available in all Nitro presets) rather than pulling in a dependency just for this.
 */
export function createPasswordResetCode() {
  return crypto.randomUUID().replace(/-/g, '')
}

/**
 * Builds the `EmailNotification` for a password reset request. Kept separate from dispatch so it
 * stays trivial to test, and so future notifications follow the same "build, then dispatch"
 * shape without needing their own module option.
 */
export function buildPasswordResetNotification({ to, resetUrl }: PasswordResetEmailPayload): EmailNotification {
  return {
    to,
    subject: 'Reset your password',
    body: `<p>Click the link below to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    text: `Reset your password: ${resetUrl}`,
  }
}

/**
 * Dispatches the "reset your password" email through whichever email driver the app has
 * configured on `@frigear-nu/notify` (defaults to logging it). `dispatchEmailNotification` is
 * auto-imported once `@frigear-nu/notify` is installed - it's a `moduleDependency` of this module.
 */
export async function dispatchPasswordResetEmail(payload: PasswordResetEmailPayload) {
  await dispatchEmailNotification(buildPasswordResetNotification(payload))
}
