const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export const isLoopbackHost = (host: string) => LOOPBACK.has(host.toLowerCase())

/**
 * `http://localhost:3000/x` with `host` `192.168.1.20` becomes `http://192.168.1.20:3000/x`: on a phone, `localhost`
 * is the phone itself, not the dev machine. Non-loopback URLs, and an empty or loopback `host`, are left as they are.
 */
export function rewriteLoopbackUrl(url: string, host: string | undefined): string {
  if (!host || isLoopbackHost(host)) return url
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return url
  }
  if (!isLoopbackHost(parsed.hostname)) return url
  parsed.hostname = host
  return parsed.toString().replace(/\/$/, url.endsWith('/') ? '/' : '')
}

/** Scheme, host and path of a URL, for comparing redirect URIs (custom schemes included). */
const redirectBase = (value: string): string | null => {
  try {
    const url = new URL(value)
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, '') || '/'}`
  }
  catch {
    return null
  }
}

/** Whether `url` is `redirectUri` (query and fragment aside) carrying an authorization response (`state` + `code`/`error`). */
export function isCallbackUrlFor(redirectUri: string, url: string): boolean {
  const base = redirectBase(url)
  if (!base || base !== redirectBase(redirectUri)) return false
  const params = new URL(url).searchParams
  return params.has('state') && (params.has('code') || params.has('error'))
}

/** Whether a request to `url` (relative ones resolved against `baseURL`) may carry the bearer token: only to `attachTo` origins. */
export function shouldAttachToken(url: string, baseURL: string | undefined, attachTo: string[]): boolean {
  let origin: string
  try {
    origin = new URL(url, baseURL || undefined).origin
  }
  catch {
    return false
  }
  return attachTo.some((allowed) => {
    try {
      return new URL(allowed).origin === origin
    }
    catch {
      return false
    }
  })
}
