import type { MobileHostOptions, MobilePublicConfig } from '../../types'

// Pure logic of `mobile.host`: the website that has the pages the app does not, shared by the build and the app.

type HostConfig = MobilePublicConfig['host']

/** `mobile.host` as the public config holds it. `url` stays empty for the issuer of Auth in client mode. */
export function resolveHostOption(option: boolean | string | MobileHostOptions | undefined): { host: HostConfig, errors: string[] } {
  const off: HostConfig = { enabled: false, url: '', routes: false, links: false }
  if (!option) return { host: off, errors: [] }
  const options: MobileHostOptions = option === true ? {} : typeof option === 'string' ? { url: option } : option
  const url = (options.url ?? '').trim()
  if (url && !/^https?:\/\/[^/?#]+/i.test(url)) return { host: off, errors: [`\`host\` "${url}" is not an http(s) URL.`] }
  return {
    host: { enabled: true, url: url.replace(/\/+$/, ''), routes: options.routes !== false, links: options.links !== false },
    errors: [],
  }
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/**
 * The website's origin and base path: the configured URL, else the issuer. As `@frigear-nu/auth` does for the issuer,
 * a loopback host becomes `rewriteLoopback` (a string: `MOBILE_LAN` builds) or, in development, the host the app was
 * loaded from (a phone on live reload). `undefined` without one.
 */
export function resolveHostBase(input: {
  url: string
  issuer?: string
  rewriteLoopback?: boolean | string
  pageHostname?: string
  dev?: boolean
}): string | undefined {
  const raw = input.url || input.issuer || ''
  if (!URL.canParse(raw)) return undefined
  const url = new URL(raw)
  if (!/^https?:$/.test(url.protocol)) return undefined
  const target = typeof input.rewriteLoopback === 'string'
    ? input.rewriteLoopback
    : input.rewriteLoopback !== false && input.dev ? input.pageHostname : undefined
  if (target && !LOOPBACK.has(target) && LOOPBACK.has(url.hostname)) url.hostname = target
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** The URL of `target` on the website: a path (with its locale prefix, query and hash) below `base`, or an absolute URL as is. */
export function hostUrl(base: string, target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target
  return `${base}${target.startsWith('/') ? '' : '/'}${target}`
}

export type LinkTarget = 'app' | 'host' | 'external' | 'other'

/** `protocol//host`: `URL.origin` is `"null"` for the app's own `capacitor://localhost`. */
export const originOf = (url: URL | Location): string => `${url.protocol}//${url.host}`

/**
 * Where a link goes: a page of the app (its own origin), the website, another site (`http`/`https`), or anything else
 * (`mailto:`, `tel:`, a custom scheme), which the platform handles.
 */
export function classifyLink(href: string, origins: { app: string, host?: string }): LinkTarget {
  if (!URL.canParse(href, origins.app)) return 'other'
  const url = new URL(href, origins.app)
  if (originOf(url) === origins.app) return 'app'
  if (!/^https?:$/.test(url.protocol)) return 'other'
  if (origins.host && originOf(url) === origins.host) return 'host'
  return 'external'
}
