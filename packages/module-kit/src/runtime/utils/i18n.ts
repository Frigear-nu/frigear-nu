import type { Nuxt } from '@nuxt/schema'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { LocaleRouting } from '../server/locale-path'

export const defaultLocaleNames: Record<string, string> = {
  da: 'Dansk',
  en: 'English',
}

/**
 * Contributes a module's locale files (`<langDir>/<code>.json`) to `@nuxtjs/i18n`.
 *
 * `@nuxtjs/i18n` merges every `files` entry registered for a locale, so each module
 * ships its own slice of the message tree (namespaced by module, e.g. `users.*`).
 * Missing files are skipped. Does nothing when `@nuxtjs/i18n` is not installed.
 */
export const registerLocales = (
  nuxt: Nuxt,
  langDir: string,
  codes: string[] = Object.keys(defaultLocaleNames),
) => {
  const locales = codes
    .map(code => ({ code, name: defaultLocaleNames[code] ?? code, file: join(langDir, `${code}.json`) }))
    .filter(locale => existsSync(locale.file))

  if (!locales.length) {
    return
  }

  // @ts-expect-error hook is provided by @nuxtjs/i18n when installed
  nuxt.hook('i18n:registerModule', (register: (config: unknown) => void) => {
    register({
      langDir,
      locales: locales.map(({ code, name, file }) => ({ code, name, files: [file] })),
    })
  })
}

type I18nOptions = {
  strategy?: string
  defaultLocale?: string
  locales?: Array<string | { code: string }>
  detectBrowserLanguage?: false | { useCookie?: boolean, cookieKey?: string }
}

/**
 * How `@nuxtjs/i18n` puts locales in this app's paths and cookie, for server code that cannot ask i18n (put it in the
 * runtime config). `null` without i18n locales. Read it in `modules:done`, once every module had the chance to add some.
 */
export function readLocaleRouting(nuxt: Nuxt): LocaleRouting | null {
  const i18n = (nuxt.options as { i18n?: I18nOptions }).i18n
  const locales = (i18n?.locales ?? []).map(locale => typeof locale === 'string' ? locale : locale.code)
  if (!locales.length) return null
  const detect = i18n?.detectBrowserLanguage
  return {
    strategy: i18n?.strategy ?? 'prefix_except_default',
    defaultLocale: i18n?.defaultLocale ?? null,
    locales,
    cookie: detect === false || detect?.useCookie === false ? null : detect?.cookieKey ?? 'i18n_redirected',
  }
}
