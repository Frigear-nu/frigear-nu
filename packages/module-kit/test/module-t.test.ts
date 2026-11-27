import { describe, expect, it, vi } from 'vitest'

const app: { $i18n?: unknown } = {}
vi.mock('#imports', () => ({ useNuxtApp: () => app }))

const { useModuleT } = await import('../src/runtime/composables/useModuleT')

const messages: Record<string, Record<string, string>> = {
  da: { 'users.offer': 'Skift til {language}' },
  en: { 'users.offer': 'Switch to {language}' },
}
const page = 'da'
const fill = (text: string, params: Record<string, string | number> = {}) =>
  Object.entries(params).reduce((out, [name, value]) => out.replaceAll(`{${name}}`, String(value)), text)
app.$i18n = {
  te: (key: string, locale = page) => key in (messages[locale] ?? {}),
  t: (key: string, params?: Record<string, string | number>, options?: { locale?: string }) =>
    fill(messages[options?.locale ?? page]![key]!, params),
}

describe('useModuleT', () => {
  it('translates into the page locale by default', () => {
    expect(useModuleT('users')('offer', 'Switch to {language}', { language: 'English' })).toBe('Skift til English')
  })

  it('translates into another locale when given one', () => {
    const t = useModuleT('users', { locale: 'en' })
    expect(t('offer', 'Switch to {language}', { language: 'English' })).toBe('Switch to English')
  })

  it('falls back to English when the locale has no such key (messages not loaded)', () => {
    const t = useModuleT('users', { locale: 'de' })
    expect(t('offer', 'Switch to {language}', { language: 'Deutsch' })).toBe('Switch to Deutsch')
  })
})
