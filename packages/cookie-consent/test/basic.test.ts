import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

// One build for both suites below: the fixture also carries the app's customizations.
await setup({ rootDir: fileURLToPath(new URL('./fixtures/basic', import.meta.url)) })

describe('cookie-consent (cookie only)', () => {
  it('renders the index page', async () => {
    expect(await $fetch('/')).toContain('<div>basic</div>')
  })

  it('exposes the default categories and treats a visitor as undecided', async () => {
    const result = await $fetch<{ consent: unknown, analytics: boolean, categories: string[] }>('/api/consent')
    expect(result.categories).toEqual(['necessary', 'analytics', 'marketing'])
    expect(result.consent).toBeNull()
    expect(result.analytics).toBe(false)
  })

  it('reads a current consent cookie on the server', async () => {
    const { version } = await $fetch<{ version: string }>('/api/consent')
    const cookie = encodeURIComponent(JSON.stringify({ v: version, ts: 1, categories: { necessary: true, analytics: true, marketing: false } }))
    const result = await $fetch<{ analytics: boolean }>('/api/consent', { headers: { cookie: `cookie-consent=${cookie}` } })
    expect(result.analytics).toBe(true)
  })

  it('renders the consent of the cookie on the server', async () => {
    const consentOf = (html: string) => html.match(/<p id="consent">([^<]*)<\/p>/)?.[1]?.trim()
    expect(consentOf(await $fetch('/'))).toBe('responded: false, analytics: false')

    const { version } = await $fetch<{ version: string }>('/api/consent')
    const cookie = encodeURIComponent(JSON.stringify({ v: version, ts: 1, categories: { necessary: true, analytics: true, marketing: false } }))
    expect(consentOf(await $fetch('/', { headers: { cookie: `cookie-consent=${cookie}` } }))).toBe('responded: true, analytics: true')
  })

  it('ignores consent made against another version and migrates legacy values', async () => {
    const stale = encodeURIComponent(JSON.stringify({ v: 'old', ts: 1, categories: { analytics: true } }))
    expect((await $fetch<{ analytics: boolean }>('/api/consent', { headers: { cookie: `cookie-consent=${stale}` } })).analytics).toBe(false)
    expect((await $fetch<{ analytics: boolean }>('/api/consent', { headers: { cookie: 'cookie-consent=accepted' } })).analytics).toBe(true)
  })
})

describe('cookie-consent (customized by the app)', () => {
  it('uses a component of the same name from the app instead of the module default', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('custom manage button')
    expect(html).not.toContain('Manage cookies')
  })

  it('lets the app replace only the banner button row', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('custom actions')
    expect(html).not.toContain('cookie-consent-accept')
  })

  it('resolves the localized policy url and label for the current locale', async () => {
    const html = await $fetch<string>('/')
    expect(html).toMatch(/data-testid="policy-url">\s*\/legal\/cookies\s*</)
    expect(html).toMatch(/data-testid="policy-label">\s*Read our cookie policy\s*</)
  })
})
