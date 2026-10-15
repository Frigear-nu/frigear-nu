import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('account pages (without @frigear-nu/menu installed)', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('./fixtures/pages-without-menus', import.meta.url)),
    // Cold builds on shared CI runners can take longer than vitest's 120s default.
    setupTimeout: 240_000,
  })

  it('still renders the profile and security pages', async () => {
    await expect($fetch('/account/profile')).resolves.toContain('Profile')
    await expect($fetch('/account/security')).resolves.toContain('Change password')
  })

  it('builds the account navigation from the configured pages', async () => {
    const html = await $fetch<string>('/account/security')
    const nav = html.slice(html.indexOf('aria-label="Account navigation"'))
    expect(nav).toContain('href="/account/profile"')
    expect(nav).toContain('href="/account/security"')
    expect(html).toMatch(/<h1[^>]*>(?:<!--[^>]*-->)?\s*Security\s*(?:<!--[^>]*-->)?<\/h1>/)
  })

  it('skips the dashboard page since it requires @frigear-nu/menu', async () => {
    await expect($fetch('/account')).rejects.toMatchObject({ statusCode: 404 })
  })
})
