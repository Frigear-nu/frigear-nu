import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

// `vue` is not a dependency of this package; take the one `nuxt` uses.
const require = createRequire(import.meta.url)
const { computed, ref } = await import(pathToFileURL(require.resolve('vue', { paths: [require.resolve('nuxt/package.json')] })).href) as typeof import('vue')

const app: { $i18n?: unknown } = {}
vi.mock('#imports', () => ({ ref, useNuxtApp: () => app }))

const { refreshMobileTranslations, useMobileTranslate } = await import('../../src/runtime/app/utils/translate')

const messages: Record<string, Record<string, string>> = { da: { 'app.tabs.account': 'Konto' }, en: { 'app.tabs.account': 'Account' } }
const createI18n = (code: string) => {
  const locale = ref(code)
  return {
    locale,
    te: (key: string) => key in messages[locale.value]!,
    t: (key: string) => messages[locale.value]![key]!,
  }
}

describe('useMobileTranslate', () => {
  it('translates a label computed before i18n was ready once the shell refreshes', () => {
    delete app.$i18n
    const translate = useMobileTranslate()
    const label = computed(() => translate('app.tabs.account', 'Account'))
    // The shell's plugins run before i18n's: no translations yet.
    expect(label.value).toBe('Account')

    app.$i18n = createI18n('da')
    refreshMobileTranslations()
    expect(label.value).toBe('Konto')
  })

  it('follows a locale switch', () => {
    const i18n = createI18n('da')
    app.$i18n = i18n
    const translate = useMobileTranslate()
    const label = computed(() => translate('app.tabs.account', 'Account'))
    expect(label.value).toBe('Konto')
    i18n.locale.value = 'en'
    expect(label.value).toBe('Account')
  })

  it('falls back without a key, or when i18n has no message for it', () => {
    app.$i18n = createI18n('da')
    const translate = useMobileTranslate()
    expect(translate(undefined, 'Home')).toBe('Home')
    expect(translate('missing.key', 'Home')).toBe('Home')
  })
})
