import type { H3Event } from 'h3'
import { apiError } from '@frigear-nu/module-kit/server'

function originOf(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value.trim())
    return /^https?:$/.test(url.protocol) ? url.origin : undefined
  }
  catch {
    return undefined
  }
}

/**
 * The origin of the configured public site URL (`runtimeConfig.public.siteUrl`: `NUXT_PUBLIC_SITE_URL` at runtime,
 * `authentication.settings.siteUrl` or `NUXT_SITE_URL` at build time), or `undefined` when none is set.
 */
export function configuredAuthSiteOrigin(event?: H3Event): string | undefined {
  return originOf(useRuntimeConfig(event).public.siteUrl)
}

/**
 * The origin emailed links (password reset, magic links, email verification and changes) point at. The configured
 * site URL; without one, the request's origin only under `nuxt dev` or with `authentication.settings.trustRequestOrigin`
 * (a platform that routes by host, such as Cloudflare Workers). Otherwise a 500: the `Host` header is chosen by the
 * client, and a link built from it could send the code in it to another site.
 */
export function authSiteOrigin(event: H3Event): string {
  const configured = configuredAuthSiteOrigin(event)
  if (configured) return configured
  if (import.meta.dev || useRuntimeConfig(event).authentication?.trustRequestOrigin === true) return getRequestURL(event).origin
  throw apiError(500, 'site_url_missing', 'The site URL is not configured: set NUXT_PUBLIC_SITE_URL.')
}

/** An absolute URL on this site (`authSiteOrigin`) for `path`, for links in emails. */
export function authSiteUrl(event: H3Event, path: string): string {
  return new URL(path, authSiteOrigin(event)).toString()
}
