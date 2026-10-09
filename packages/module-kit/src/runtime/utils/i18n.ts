import type { Nuxt } from '@nuxt/schema'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

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
