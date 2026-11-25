import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'

interface I18nPublicConfig { i18n?: { baseUrl?: unknown } }

/**
 * Fills an empty `public.i18n.baseUrl` with the request origin, on the runtime config copy of this request. Previews
 * (Cloudflare and alike) get a domain nobody knows before the deploy, so `NUXT_PUBLIC_I18N_BASE_URL` cannot be set
 * there, and without it `@nuxtjs/i18n` warns on every render and writes relative hreflang and canonical links.
 * An explicit base URL (config, env or the base layer's `site.url`) always wins. Answers the origin it set, if any.
 */
export function fillI18nBaseUrl(event: H3Event, config: { public: I18nPublicConfig }): string | undefined {
  const i18n = config.public.i18n
  if (!i18n || i18n.baseUrl) return undefined
  const origin = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true }).origin
  i18n.baseUrl = origin
  return origin
}
