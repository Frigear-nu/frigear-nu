import type { H3Event } from 'h3'
import { localeOfPath, matchLocale, type LocaleRouting } from '@frigear-nu/module-kit/server'

/** Where the language of a frigear.nu login can come from: the page it started on, its `?redirect=`, i18n's cookie. */
export type FrigearUiLocaleSources = {
  /** The path of the page the login started on (a same-origin `Referer`). */
  page?: string | null
  /** The `?redirect=` target of the login. */
  redirect?: unknown
  /** The value of i18n's locale cookie. */
  cookie?: string | null
}

const isSitePath = (value: unknown): value is string => typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')

/**
 * The language to ask frigear.nu to show its pages in (OIDC `ui_locales`): the locale of the page the login started on,
 * else of its redirect target, else i18n's cookie (the only source under `no_prefix`). Under `prefix_except_default` an
 * unprefixed path is in the default locale. `undefined` without i18n or when nothing says.
 */
export function pickFrigearUiLocale(sources: FrigearUiLocaleSources, i18n: LocaleRouting | null | undefined): string | undefined {
  if (!i18n) return undefined
  const fromPath = (path: unknown) => isSitePath(path) ? localeOfPath(path, i18n) : null
  return fromPath(sources.page) ?? fromPath(sources.redirect) ?? matchLocale(sources.cookie, i18n.locales) ?? undefined
}

/** `pickFrigearUiLocale` for a request to start a login: its same-origin `Referer`, `?redirect=` (or `redirect`) and cookie. */
export function resolveFrigearUiLocale(event: H3Event, sso: { i18n: LocaleRouting | null }, redirect: unknown = getQuery(event).redirect): string | undefined {
  if (!sso.i18n) return undefined
  let page: string | undefined
  const referer = getHeader(event, 'referer')
  if (referer) {
    try {
      const url = new URL(referer)
      const hosts = [getRequestURL(event).host, getRequestURL(event, { xForwardedHost: true }).host]
      if (hosts.includes(url.host)) page = url.pathname
    }
    catch {
      // not a URL: ignored
    }
  }
  const cookie = sso.i18n.cookie ? getCookie(event, sso.i18n.cookie) : undefined
  return pickFrigearUiLocale({ page, redirect, cookie }, sso.i18n)
}

/** The optional `locale` claim, as one of the app's i18n locales (`matchLocale`); anything else is ignored. */
export function parseFrigearLocaleClaim(value: unknown, locales: readonly string[]): string | undefined {
  return typeof value === 'string' ? matchLocale(value, locales) ?? undefined : undefined
}
