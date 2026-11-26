// Codes, targets and visitors of short links: pure functions shared by the server utils, the admin form and the tests.

/** The owner module of links made by hand on the admin page. */
export const SHORT_LINKS_MANUAL_OWNER = 'short-links'

export const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** Length of a random code: 62^7 is about 3.5 trillion codes. */
export const SHORT_CODE_LENGTH = 7

/** A vanity code: letters, digits, `-` and `_`, 3 to 64 characters, starting with a letter or digit. */
export const VANITY_CODE_PATTERN = /^[A-Z0-9][\w-]{2,63}$/i

/** A subject (the segment after the code): URL-safe characters only, at most 200. */
export const SUBJECT_PATTERN = /^[\w.~-]{1,200}$/

/** The longest target URL accepted. */
export const MAX_URL_LENGTH = 2048

/**
 * A random base62 code of `length` characters from `crypto.getRandomValues`. Bytes of 248 and above are thrown away
 * (248 = 4 × 62), so every character is equally likely.
 */
export function randomShortCode(length: number = SHORT_CODE_LENGTH): string {
  let code = ''
  while (code.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const byte of bytes) {
      if (byte >= 248) continue
      code += BASE62[byte % 62]
      if (code.length === length) break
    }
  }
  return code
}

export const isVanityCode = (value: string) => VANITY_CODE_PATTERN.test(value)

export const isShortLinkSubject = (value: string) => SUBJECT_PATTERN.test(value)

/**
 * The target as a normalised absolute URL, or `null` when it is not one a short link may point at: only `http:` and
 * `https:` with a host, no credentials (`https://user:pass@...`), at most {@link MAX_URL_LENGTH} characters.
 */
export function normalizeShortLinkTarget(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null
  let url: URL
  try {
    url = new URL(trimmed)
  }
  catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname || url.username || url.password) return null
  const href = url.toString()
  return href.length > MAX_URL_LENGTH ? null : href
}

/**
 * User agents of link scanners and preview fetchers (mail security gateways, chat apps, search bots). They are
 * redirected like anybody else, but their visits are not counted as clicks.
 */
export const SCANNER_USER_AGENTS: readonly RegExp[] = [
  /bot\b/i,
  /bot\//i,
  /crawler|spider|slurp/i,
  /preview/i,
  /facebookexternalhit|facebot/i,
  /whatsapp/i,
  /telegram/i,
  /skypeuripreview/i,
  /microsoft office|ms-office|outlook|safelinks/i,
  /proofpoint|mimecast|barracuda|forcepoint|symantec|trendmicro|sophos|zscaler|fortiguard|messagelabs/i,
  /google-safety|googleimageproxy|google-read-aloud/i,
  /^(?:node|undici)\b/i,
  /headlesschrome|phantomjs|python-requests|python-urllib|curl\/|wget\/|go-http-client|okhttp|java\/|libwww-perl|httpclient|axios\//i,
]

/** A request a person did not make: no user agent, or one of {@link SCANNER_USER_AGENTS}. */
export function isLinkScanner(userAgent: string | null | undefined): boolean {
  if (!userAgent?.trim()) return true
  return SCANNER_USER_AGENTS.some(pattern => pattern.test(userAgent))
}

/** The redirect path `/<path>/<code>[/<subject>]` (path without a trailing slash, segments URL-encoded). */
export function shortLinkPath(path: string, code: string, subject?: string | null): string {
  const base = `/${path.replace(/^\/+|\/+$/g, '')}`
  const prefix = base === '/' ? '' : base
  return `${prefix}/${encodeURIComponent(code)}${subject ? `/${encodeURIComponent(subject)}` : ''}`
}

/** The name a toast or dialog uses for a link: its title, else its code. */
export const shortLinkName = (link: { title?: string | null, code: string }) => link.title || link.code
