import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('cookie-consent (customized by the app)', async () => {
  await setup({ rootDir: fileURLToPath(new URL('./fixtures/customized', import.meta.url)) })

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
