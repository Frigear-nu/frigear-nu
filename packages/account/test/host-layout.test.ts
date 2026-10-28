import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

const marker = 'data-testid="host-account-layout"'

describe('account area in a host layout', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/host-layout', import.meta.url)),
    // Cold builds on shared CI runners can take longer than vitest's 120s default.
    setupTimeout: 240_000,
  })

  it('renders the account pages in the app\'s own `account` layout instead of the module\'s', async () => {
    const html = await $fetch<string>('/account/security')
    expect(html).toContain(marker)
    // The page still renders its own heading, inside the host layout.
    expect(html).toMatch(/<h1[^>]*>(?:<!--[^>]*-->)?\s*Security\s*(?:<!--[^>]*-->)?<\/h1>/)
    expect(html.indexOf(marker)).toBeLessThan(html.indexOf('<h1'))
    // Not the module's layout: no account navigation and no site layout around it.
    expect(html).not.toContain('aria-label="Account navigation"')
    expect(html).not.toContain('site header')
  })

  it('leaves pages outside the account area in the default layout', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('site header')
    expect(html).not.toContain(marker)
  })
})
