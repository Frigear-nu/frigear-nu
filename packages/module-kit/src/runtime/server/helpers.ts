import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'
import { badRequest } from './errors'

/**
 * The first free copy slug of `base`: `<base>-copy`, then `<base>-copy-2`, `-3`, ... `exists` says whether a slug
 * is taken (any truthy value counts, so a `findBySlug` lookup can be passed as is).
 */
export async function uniqueCopySlug(base: string, exists: (slug: string) => Promise<unknown>): Promise<string> {
  let slug = `${base}-copy`
  for (let n = 2; await exists(slug); n++) slug = `${base}-copy-${n}`
  return slug
}

/**
 * Validates a redirect URL a client supplied: it must be a relative path (`/x`) or an absolute URL on `origin`.
 * Returns the normalised absolute URL (`URL.href`) on that origin, or `null` when it is unsafe.
 */
export function sameOriginUrl(input: string, origin: string): string | null {
  // `//host` and `/\host` are protocol-relative / browser-normalised to another host.
  if (input.startsWith('//') || input.startsWith('/\\')) return null
  try {
    const base = new URL(origin)
    const url = input.startsWith('/') ? new URL(input, base) : new URL(input)
    return url.origin === base.origin ? url.href : null
  }
  catch {
    return null
  }
}

/**
 * A client-supplied return URL (Stripe success/cancel/return) made absolute on the request's origin. Without `url`
 * it is `fallback` (a path, default `/`) on that origin. Throws 400 `bad_request` when `url` points elsewhere.
 *
 *     const successUrl = resolveSameOriginUrl(event, body.successUrl, { fallback: '/membership', name: 'successUrl' })
 */
export function resolveSameOriginUrl(event: H3Event, url: string | undefined, options: { fallback?: string, name?: string } = {}): string {
  const origin = getRequestURL(event).origin
  if (!url) return `${origin}${options.fallback ?? '/'}`
  const safe = sameOriginUrl(url, origin)
  if (!safe) throw badRequest(`${options.name ?? 'url'} must be a relative path or an URL on the same origin.`)
  return safe
}
