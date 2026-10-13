/**
 * A URL-safe, unguessable code for a single-use link (password reset, magic link, email change). Uses the Web
 * Crypto API (available in all Nitro presets) rather than pulling in a dependency just for this.
 */
export function createOneTimeCode() {
  return crypto.randomUUID().replace(/-/g, '')
}
