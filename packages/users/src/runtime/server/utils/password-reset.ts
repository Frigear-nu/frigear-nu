import sendPasswordResetEmail from '#users/password-reset-mailer'

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
 * Thin wrapper around the (possibly user-overridden) mailer template so routes don't need to
 * import the virtual module directly.
 */
export async function dispatchPasswordResetEmail(payload: PasswordResetEmailPayload) {
  await sendPasswordResetEmail(payload)
}
