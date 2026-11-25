import { deriveSecret, useRuntimeConfig } from 'nuxt/server'

// Secrets a module owns (an encryption or signing key nobody outside the app shares) fall back to one derived from
// Nuxt's `appSecret` (`NUXT_APP_SECRET`), so an app that sets only that secret works. A module's own key still wins,
// and so do the keys it fell back to before (data encrypted with them stays readable). Not for secrets shared with a
// third party (a webhook secret, an API key), nor for keys that cannot be derived (an RSA signing key).
// Its own entry point, apart from `./server`: `nuxt/server` only resolves inside a Nuxt build.

/** Nuxt's minimum for `appSecret`; `deriveSecret` refuses a shorter one. */
export const APP_SECRET_MIN_LENGTH = 32

/** The first candidate that is a non-empty string, trimmed; `''` when there is none. */
export function pickSecret(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
}

/**
 * Whether `appSecret` (`NUXT_APP_SECRET`) is set and long enough to derive secrets from. Reads the shared runtime
 * config, the one `deriveSecret` derives from (and nuxt-auth-utils seals sessions with).
 */
export function hasAppSecret(): boolean {
  const root = (useRuntimeConfig() as { appSecret?: unknown }).appSecret
  return typeof root === 'string' && root.length >= APP_SECRET_MIN_LENGTH
}

/**
 * A module's secret: the first non-empty `candidates` (its own key, then the keys it used to fall back to), else one
 * derived from `appSecret` for `purpose` (namespace it: `@frigear-nu/<pkg>:<what>`), else `''`. Never throws for a
 * missing secret, so the caller keeps its own error.
 */
export async function resolveSecret(purpose: string, ...candidates: unknown[]): Promise<string> {
  const own = pickSecret(...candidates)
  if (own) return own
  return hasAppSecret() ? deriveSecret(purpose) : ''
}
