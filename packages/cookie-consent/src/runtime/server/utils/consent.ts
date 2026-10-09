import type { H3Event } from 'h3'
import type { ConsentState, PublicModuleOptions } from '../../../types'
import { normalizeConsent } from '../../utils/consent'

/** The resolved public module options (categories, version, cookie name, ...). */
export function getCookieConsentConfig(event: H3Event) {
  return (useRuntimeConfig(event).public as { cookieConsent?: PublicModuleOptions }).cookieConsent
}

/** Reads the visitor's current consent from the request cookie (`null` = undecided / outdated). */
export function getCookieConsent(event: H3Event): ConsentState | null {
  const config = getCookieConsentConfig(event)
  if (!config) return null
  const raw = getCookie(event, config.cookieName)
  if (!raw) return null
  let parsed: unknown = raw
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    // legacy plain-string value ('accepted' / 'rejected')
  }
  return normalizeConsent(parsed, config.categories, config.version)
}

/** Whether the visitor granted `category` - use to gate tracking in SSR / API code. */
export function hasCookieConsent(event: H3Event, category: string): boolean {
  return getCookieConsent(event)?.categories[category] === true
}
